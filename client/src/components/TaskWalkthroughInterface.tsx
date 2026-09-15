import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Mic, Monitor, Square, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AdminConfig, Message } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import { GoogleGenAI, Modality } from "@google/genai";
import UserNameModal from "@/components/UserNameModal";
import CriterionFeedbackList from "@/components/CriterionFeedbackList";

interface Props {
  config: AdminConfig;
  sessionId: string;
  userName: string | null;
  onUserNameSubmit: (name: string, mode?: 'typed' | 'spoken') => string;
}

type ConnectionState = 'idle' | 'connecting' | 'active' | 'ended';
type ActivityState = 'idle' | 'listening' | 'speaking';

// ---------------------------------------------------------------------------
// Screen capture tuning.
// Frames travel over the SAME WebSocket as the mic audio, so oversized or
// over-frequent frames queue ahead of speech and delay Gemini's spoken replies.
// Every frame is also tokenised into the session context, so a high rate makes
// responses slower the longer the session runs. Keep this conservative.
// ---------------------------------------------------------------------------
const FRAME_INTERVAL_MS = 1500;
const FRAME_MAX_WIDTH = 960;
const FRAME_MAX_HEIGHT = 540;
const FRAME_QUALITY = 0.4;
const PREVIEW_WIDTH = 320;
const PREVIEW_QUALITY = 0.5;
// Re-send an unchanged frame occasionally so the model keeps recent visual
// context even while the learner's screen is static.
const MAX_SKIPPED_FRAMES = 10;

// Verbose Gemini logging is opt-in — it stringifies every inbound message,
// including base64 audio chunks, on the main thread during playback.
const DEBUG_GEMINI = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('debugGemini');

interface AttemptData {
  attemptNumber: number;
  chatMode: string | null;
  feedback: { bullets: string[]; score?: number | null; summary?: string | null } | null;
}

function resampleBuffer(buffer: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate) return buffer;
  const ratio = inputRate / outputRate;
  const outputLength = Math.ceil(buffer.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIdx = i * ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, buffer.length - 1);
    const frac = srcIdx - lo;
    output[i] = buffer[lo] * (1 - frac) + buffer[hi] * frac;
  }
  return output;
}

function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = Math.round(clamped * 32767);
  }
  return int16;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decodeBase64PCM(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
  return float32;
}

export default function TaskWalkthroughInterface({ config, sessionId, userName, onUserNameSubmit }: Props) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [activityState, setActivityState] = useState<ActivityState>('idle');
  const [transcript, setTranscript] = useState<Message[]>([]);
  const [isGettingFeedback, setIsGettingFeedback] = useState(false);
  const [feedbackData, setFeedbackData] = useState<{ bullets: string[]; score?: number; summary?: string } | null>(null);
  const [screenPreviewUrl, setScreenPreviewUrl] = useState<string | null>(null);
  const [showNameModal, setShowNameModal] = useState<boolean>(!userName);

  const sessionRef = useRef<any>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastFrameRef = useRef<string | null>(null);
  const skippedFramesRef = useRef(0);
  const transcriptRef = useRef<Message[]>([]);
  const nextPlayTimeRef = useRef(0);
  const scheduledSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const autoFeedbackFiredRef = useRef(false);

  const { toast } = useToast();

  const queryClient = useQueryClient();
  const queryKey = [`/api/conversations/${config.id}/session/${sessionId}`];

  const { data: existingAttempts = [] } = useQuery<AttemptData[]>({
    queryKey,
    staleTime: Infinity,
  });

  const persistedFeedback = (existingAttempts[0]?.feedback as { bullets: string[]; score?: number | null; summary?: string } | undefined) ?? null;
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current || !persistedFeedback) return;
    hasInitialized.current = true;
    setConnectionState('ended');
    setFeedbackData({
      bullets: persistedFeedback.bullets ?? [],
      score: persistedFeedback.score ?? undefined,
      summary: persistedFeedback.summary ?? undefined,
    });
  }, [persistedFeedback]);

  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  const [displayActivityState, setDisplayActivityState] = useState<ActivityState>('idle');
  useEffect(() => {
    const t = setTimeout(() => setDisplayActivityState(activityState), 500);
    return () => clearTimeout(t);
  }, [activityState]);

  const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    setTranscript(prev => [...prev, {
      id: uuidv4(), role, content, timestamp: Date.now(), sessionId,
    }]);
  }, [sessionId]);

  const stopAllAudio = useCallback(() => {
    scheduledSourcesRef.current.forEach(src => { try { src.stop(); } catch {} });
    scheduledSourcesRef.current = [];
    if (audioCtxRef.current) nextPlayTimeRef.current = audioCtxRef.current.currentTime;
    setActivityState('idle');
  }, []);

  const playAudioChunk = useCallback((float32: Float32Array) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const startTime = Math.max(ctx.currentTime, nextPlayTimeRef.current);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + buffer.duration;
    scheduledSourcesRef.current.push(source);
    source.onended = () => {
      scheduledSourcesRef.current = scheduledSourcesRef.current.filter(s => s !== source);
    };
  }, []);

  const handleGeminiMessage = useCallback((msg: any) => {
    try {
      if (msg.serverContent?.interrupted) {
        stopAllAudio();
        return;
      }
      if (msg.serverContent?.modelTurn?.parts) {
        for (const part of msg.serverContent.modelTurn.parts) {
          if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
            playAudioChunk(decodeBase64PCM(part.inlineData.data));
            setActivityState('speaking');
          }
        }
      }
      if (msg.serverContent?.turnComplete) setActivityState('idle');
      if (msg.serverContent?.outputTranscription?.text) {
        const text = msg.serverContent.outputTranscription.text.trim();
        if (text) {
          setTranscript(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { ...last, content: (typeof last.content === 'string' ? last.content : '') + text }];
            }
            return [...prev, { id: uuidv4(), role: 'assistant', content: text, timestamp: Date.now(), sessionId }];
          });
        }
      }
      if (msg.serverContent?.inputTranscription?.text) {
        const text = msg.serverContent.inputTranscription.text.trim();
        if (text) addMessage('user', text);
      }
    } catch {}
  }, [addMessage, playAudioChunk, stopAllAudio, sessionId]);

  const startSession = async () => {
    setConnectionState('connecting');
    try {
      const res = await fetch('/api/gemini-live/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId: config.id }),
      });
      if (!res.ok) throw new Error('Failed to get session credentials');
      const { apiKey, systemPrompt, model } = await res.json();

      const audioCtx = new AudioContext({ sampleRate: 24000 });
      await audioCtx.resume();
      audioCtxRef.current = audioCtx;
      nextPlayTimeRef.current = audioCtx.currentTime;

      const ai = new GoogleGenAI({ apiKey });
      const geminiSession = await (ai as any).live.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: systemPrompt,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Capella' } } },
        },
        callbacks: {
          onopen: () => { if (DEBUG_GEMINI) console.log('[Gemini] opened'); },
          onmessage: handleGeminiMessage,
          onerror: (err: any) => {
            console.error('[Gemini] error:', err);
            toast({ variant: 'destructive', title: 'Connection error', description: String(err) });
          },
          onclose: (e: any) => {
            sessionRef.current = null;
            cleanup();
            setActivityState('idle');
            if (transcriptRef.current.length === 0) {
              setConnectionState('idle');
              if (e?.code && e.code !== 1000) {
                toast({ variant: 'destructive', title: 'Connection failed', description: e?.reason || 'Session ended unexpectedly.' });
              }
            } else {
              setConnectionState('ended');
            }
          },
        },
      });
      sessionRef.current = geminiSession;

      // Mic
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      micStreamRef.current = micStream;

      const nativeCtx = new AudioContext();
      const source = nativeCtx.createMediaStreamSource(micStream);
      const processor = nativeCtx.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!sessionRef.current) return;
        const float32 = e.inputBuffer.getChannelData(0);
        const resampled = resampleBuffer(float32, nativeCtx.sampleRate, 16000);
        const int16 = float32ToInt16(resampled);
        const base64 = arrayBufferToBase64(int16.buffer);
        sessionRef.current.sendRealtimeInput({ audio: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
        setActivityState('listening');
      };

      source.connect(processor);
      processor.connect(nativeCtx.destination);

      // Screen share
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 1, width: 1280, height: 720 },
        audio: false,
      });
      screenStreamRef.current = screenStream;

      screenStream.getVideoTracks()[0].onended = () => {
        toast({ description: 'Screen share stopped.' });
        stopSession();
      };

      const video = document.createElement('video');
      video.srcObject = screenStream;
      video.autoplay = true;
      video.muted = true;
      screenVideoRef.current = video;

      const canvas = document.createElement('canvas');
      canvas.width = FRAME_MAX_WIDTH;
      canvas.height = FRAME_MAX_HEIGHT;
      screenCanvasRef.current = canvas;

      // Separate, much smaller canvas for the on-screen thumbnail so the frame
      // sent to Gemini is never re-encoded at preview size (or vice versa).
      const previewCanvas = document.createElement('canvas');
      previewCanvas.width = PREVIEW_WIDTH;
      previewCanvas.height = Math.round(PREVIEW_WIDTH * FRAME_MAX_HEIGHT / FRAME_MAX_WIDTH);
      previewCanvasRef.current = previewCanvas;

      // Fit the capture inside FRAME_MAX_WIDTH x FRAME_MAX_HEIGHT without
      // distorting it — shared windows are not always 16:9.
      video.onloadedmetadata = () => {
        const srcW = video.videoWidth || FRAME_MAX_WIDTH;
        const srcH = video.videoHeight || FRAME_MAX_HEIGHT;
        const scale = Math.min(FRAME_MAX_WIDTH / srcW, FRAME_MAX_HEIGHT / srcH, 1);
        canvas.width = Math.round(srcW * scale);
        canvas.height = Math.round(srcH * scale);
        previewCanvas.width = PREVIEW_WIDTH;
        previewCanvas.height = Math.round((canvas.height / canvas.width) * PREVIEW_WIDTH);
        video.play();
      };

      // Downscale, encode and send a frame on a fixed interval. Identical
      // frames are skipped: a static screen would otherwise re-send the same
      // JPEG every tick, for no extra information.
      frameIntervalRef.current = setInterval(() => {
        const canvasEl = screenCanvasRef.current;
        const videoEl = screenVideoRef.current;
        if (!sessionRef.current || !videoEl || !canvasEl) return;
        const ctx = canvasEl.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
        const base64 = canvasEl.toDataURL('image/jpeg', FRAME_QUALITY).split(',')[1];
        if (!base64) return;

        if (base64 === lastFrameRef.current && skippedFramesRef.current < MAX_SKIPPED_FRAMES) {
          skippedFramesRef.current++;
          return;
        }
        lastFrameRef.current = base64;
        skippedFramesRef.current = 0;
        sessionRef.current.sendRealtimeInput({ video: { data: base64, mimeType: 'image/jpeg' } });

        // Thumbnail encoded separately, and only when the screen actually changed.
        const previewEl = previewCanvasRef.current;
        const previewCtx = previewEl?.getContext('2d');
        if (previewEl && previewCtx) {
          previewCtx.drawImage(canvasEl, 0, 0, previewEl.width, previewEl.height);
          setScreenPreviewUrl(previewEl.toDataURL('image/jpeg', PREVIEW_QUALITY));
        }
      }, FRAME_INTERVAL_MS);

      setConnectionState('active');

      setTimeout(() => {
        if (sessionRef.current) {
          const greeting = userName
            ? `Hi, I'm ${userName}. I'm sharing my screen so you can see where I've got to with the task. Please greet me by name, briefly note what you can see on my screen, and ask me to start walking you through what I've done so far. Do not ask me to share my screen.`
            : `Hi. I'm sharing my screen so you can see where I've got to with the task. Please greet me, briefly note what you can see on my screen, and ask me to start walking you through what I've done so far. Do not ask me to share my screen.`;
          sessionRef.current.sendRealtimeInput({ text: greeting });
        }
      }, 800);

    } catch (err: any) {
      setConnectionState('idle');
      cleanup();
      toast({ variant: 'destructive', title: 'Failed to start session', description: err.message });
    }
  };

  const cleanup = () => {
    if (frameIntervalRef.current) { clearInterval(frameIntervalRef.current); frameIntervalRef.current = null; }
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    scriptProcessorRef.current?.disconnect();
    audioCtxRef.current?.close().catch(() => {});
    scriptProcessorRef.current = null;
    micStreamRef.current = null;
    screenStreamRef.current = null;
    screenVideoRef.current = null;
    screenCanvasRef.current = null;
    previewCanvasRef.current = null;
    lastFrameRef.current = null;
    skippedFramesRef.current = 0;
    setScreenPreviewUrl(null);
  };

  const stopSession = () => {
    try { sessionRef.current?.close?.(); } catch {}
    sessionRef.current = null;
    cleanup();
    setConnectionState('ended');
    setActivityState('idle');
  };

  const getFeedback = async () => {
    setIsGettingFeedback(true);
    try {
      const res = await fetch('/api/chat-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configId: config.id,
          sessionId,
          messages: transcriptRef.current,
          type: 'chat',
          userName,
          chatMode: 'spoken',
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setFeedbackData(data);
      queryClient.setQueryData<AttemptData[]>(queryKey, (old = []) => {
        const updated: AttemptData = { attemptNumber: 1, chatMode: 'spoken', feedback: data };
        return [updated, ...old.filter(a => a.attemptNumber !== 1)];
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setIsGettingFeedback(false);
    }
  };

  useEffect(() => {
    if (transcript.length === 0 || !config.id) return;
    fetch('/api/conversations/save-transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configId: config.id, sessionId, userName, chatMode: 'spoken', messages: transcript }),
    }).catch(() => {});
  }, [transcript, config.id, sessionId, userName]);

  useEffect(() => {
    if (connectionState !== 'ended') return;
    if (autoFeedbackFiredRef.current) return;
    if (transcriptRef.current.length < 2) return;
    autoFeedbackFiredRef.current = true;
    getFeedback();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionState]);

  useEffect(() => () => {
    try { sessionRef.current?.close?.(); } catch {}
    sessionRef.current = null;
    if (frameIntervalRef.current) { clearInterval(frameIntervalRef.current); frameIntervalRef.current = null; }
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    scriptProcessorRef.current?.disconnect();
    audioCtxRef.current?.close().catch(() => {});
  }, []);

  const handleNameSubmit = (name: string) => {
    onUserNameSubmit(name, 'spoken');
    setShowNameModal(false);
  };

  const orbColour = { idle: 'bg-gray-100', listening: 'bg-green-100', speaking: 'bg-blue-100' }[displayActivityState];
  const statusLabel = { idle: '', listening: 'Listening...', speaking: 'AI is speaking...' }[displayActivityState];

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-50">
      <UserNameModal open={showNameModal} interactionMode="spoken" onSubmit={handleNameSubmit} />

      {/* Header */}
      <div className="flex items-center justify-between px-8 py-4 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className={`rounded-full w-3 h-3 ${connectionState === 'active' ? 'bg-green-500 animate-pulse' : connectionState === 'ended' ? 'bg-blue-500' : 'bg-gray-300'}`} />
          <span className="font-semibold text-gray-800 text-lg">{config.title}</span>
          {connectionState === 'active' && (
            <span className="text-sm text-gray-500 flex items-center gap-1">
              <Monitor className="h-4 w-4" /> Screen sharing · <Mic className="h-4 w-4" /> Mic active
            </span>
          )}
          {connectionState === 'ended' && (
            <span className="text-sm text-blue-600 font-medium">Walkthrough complete</span>
          )}
        </div>
        {screenPreviewUrl && connectionState === 'active' && (
          <img
            src={screenPreviewUrl}
            alt="Screen preview"
            className="h-16 rounded border border-gray-200 shadow-sm opacity-80"
          />
        )}
      </div>

      <div className={`flex-1 flex flex-col items-center gap-8 px-8 min-h-0 ${connectionState === 'ended' ? 'justify-start py-8 overflow-y-auto' : 'justify-center py-10'}`}>

        {connectionState === 'idle' && (
          <div className="text-center space-y-6 max-w-lg w-full">
            <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
              <ClipboardList className="h-10 w-10 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Ready to walk through your work?</h2>
              <p className="text-gray-500 text-base">
                Share your screen so the AI can see where you've got to, then talk through what you've done. It will coach you through anything you haven't completed yet.
              </p>
            </div>

            {config.userInstructions && (
              <div className="text-left bg-blue-50 rounded-lg p-4 border border-blue-100">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <ClipboardList className="h-3.5 w-3.5" /> Instructions
                </p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{config.userInstructions}</p>
              </div>
            )}

            <Button
              onClick={startSession}
              size="lg"
              disabled={!userName}
              className="bg-blue-600 hover:bg-blue-700 text-white px-10 text-base"
            >
              <Monitor className="h-5 w-5 mr-2" /> Start Walkthrough
            </Button>
            <p className="text-xs text-gray-400">Your browser will ask for screen share and microphone permissions.</p>
          </div>
        )}

        {connectionState === 'connecting' && (
          <div className="text-center space-y-4">
            <div className="h-10 w-10 rounded-full border-4 border-blue-400 border-t-transparent animate-spin mx-auto" />
            <p className="text-gray-500 text-lg">Connecting...</p>
          </div>
        )}

        {connectionState === 'active' && (
          <div className="w-full max-w-4xl flex flex-col gap-6 min-h-0 flex-1">
            {config.userInstructions && (
              <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Instructions</p>
                <p className="text-sm text-gray-600 line-clamp-3">{config.userInstructions}</p>
              </div>
            )}
            <div className="flex flex-col items-center gap-3">
              <div className={`rounded-full w-20 h-20 ${orbColour} transition-all duration-500 flex items-center justify-center ${displayActivityState !== 'idle' ? 'animate-pulse' : ''}`}>
                {displayActivityState === 'speaking'
                  ? <Monitor className="h-10 w-10 text-blue-600" />
                  : <Mic className={`h-10 w-10 ${displayActivityState === 'listening' ? 'text-green-600' : 'text-gray-400'}`} />
                }
              </div>
              <p className="text-sm text-gray-500 h-5 text-center">{statusLabel}</p>
              <Button onClick={stopSession} variant="destructive" size="lg" className="px-8">
                <Square className="h-4 w-4 mr-2 fill-current" /> Stop & Get Feedback
              </Button>
            </div>
          </div>
        )}

        {connectionState === 'ended' && (
          <div className="w-full max-w-4xl space-y-6">
            <p className="text-center text-gray-500">
              {feedbackData ? 'Feedback is ready.' : isGettingFeedback ? 'Generating feedback…' : transcript.length < 2 ? 'Not enough transcript to generate feedback.' : 'Preparing feedback…'}
            </p>

            {!feedbackData && isGettingFeedback && (
              <div className="flex justify-center">
                <div className="h-8 w-8 rounded-full border-4 border-blue-400 border-t-transparent animate-spin" />
              </div>
            )}

            {feedbackData && (
              <div className="space-y-3">
                {(feedbackData.score !== undefined || feedbackData.summary) && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-2">
                    {feedbackData.score !== undefined && (
                      <div className="text-center">
                        <span className="text-5xl font-bold text-blue-600">{feedbackData.score}</span>
                        <span className="text-2xl text-gray-400">/10</span>
                      </div>
                    )}
                    {feedbackData.summary && (
                      <p className="text-gray-600 text-center italic text-base">{feedbackData.summary}</p>
                    )}
                  </div>
                )}
                <CriterionFeedbackList bullets={feedbackData.bullets} />
              </div>
            )}

            <div className="flex flex-col items-center gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  queryClient.setQueryData(queryKey, []);
                  setConnectionState('idle');
                  setTranscript([]);
                  setFeedbackData(null);
                  autoFeedbackFiredRef.current = false;
                }}
              >
                Start New Walkthrough
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="py-2 text-center text-xs text-gray-400">
        Screen content and audio are sent to Google Gemini for real-time coaching.
      </div>
    </div>
  );
}
