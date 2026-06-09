import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Lightbulb, Trophy, ChevronDown, Info, Brain, PauseCircle, PlayCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AdminConfig, Message } from "@/lib/types";
import UserNameModal from "./UserNameModal";
import ThinkingMapModal from "./ThinkingMapModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { v4 as uuidv4 } from "uuid";
import { track, EventName } from "@/lib/mixpanel";

interface Props {
  config: AdminConfig;
  sessionId: string;
  userName: string | null;
  onUserNameSubmit: (name: string, mode?: 'typed' | 'spoken') => string;
}

type ConnectionState = 'idle' | 'connecting' | 'active' | 'ended';
type ActivityState = 'idle' | 'listening' | 'speaking';

export default function VoiceChatInterface({ config, sessionId, userName, onUserNameSubmit }: Props) {
  const [showNameModal, setShowNameModal] = useState(!userName);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [activityState, setActivityState] = useState<ActivityState>('idle');
  const [transcript, setTranscript] = useState<Message[]>([]);
  const [isGettingHint, setIsGettingHint] = useState(false);
  const [isGettingFeedback, setIsGettingFeedback] = useState(false);
  const [isConfirmingFeedback, setIsConfirmingFeedback] = useState(false);
  const [feedbackData, setFeedbackData] = useState<{ bullets: string[]; score?: number; summary?: string } | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(true);
  const [isGettingSummary, setIsGettingSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const isThoughtPartner = (config.type as string) === 'thought-partner';

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const capturedResponseIds = useRef<Set<string>>(new Set());

  const { toast } = useToast();

  // Persist transcript to DB whenever it updates so live stats & admin count work
  useEffect(() => {
    if (transcript.length === 0 || !config.id || !sessionId) return;
    fetch('/api/conversations/save-transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configId: config.id, sessionId, userName, chatMode: 'spoken', messages: transcript }),
    }).catch(() => {});
  }, [transcript, config.id, sessionId, userName]);

  const hasEnoughMessages = transcript.length >= 4;

  const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    setTranscript(prev => [...prev, {
      id: uuidv4(),
      role,
      content,
      timestamp: Date.now(),
      sessionId,
    }]);
  }, [sessionId]);

  const handleDataChannelMessage = useCallback((event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);
      console.log('[voice]', msg.type, msg);

      if (msg.type === 'input_audio_buffer.speech_started') {
        setActivityState('listening');
      }
      if (msg.type === 'input_audio_buffer.speech_stopped') {
        setActivityState('idle');
      }
      if (msg.type === 'response.audio.delta' || msg.type === 'response.output_audio.delta') {
        setActivityState('speaking');
      }
      if (msg.type === 'response.audio.done' || msg.type === 'response.output_audio.done') {
        setActivityState('idle');
      }
      if (msg.type === 'conversation.item.input_audio_transcription.completed') {
        const text = msg.transcript?.trim();
        if (text) addMessage('user', text);
      }
      if (msg.type === 'response.output_audio_transcript.done' || msg.type === 'response.audio_transcript.done') {
        const text = msg.transcript?.trim();
        if (text) {
          if (msg.response_id) capturedResponseIds.current.add(msg.response_id);
          addMessage('assistant', text);
        }
      }
      // Fallback: response.done always fires and contains full output with transcripts
      if (msg.type === 'response.done') {
        const responseId = msg.response?.id;
        if (responseId && capturedResponseIds.current.has(responseId)) return;
        const output: any[] = msg.response?.output ?? [];
        for (const item of output) {
          if (item.role === 'assistant' && Array.isArray(item.content)) {
            const audioPart = item.content.find((c: any) => c.type === 'audio' && c.transcript);
            if (audioPart?.transcript?.trim()) {
              if (responseId) capturedResponseIds.current.add(responseId);
              addMessage('assistant', audioPart.transcript.trim());
            }
          }
        }
      }
    } catch {}
  }, [addMessage]);

  const startSession = async () => {
    setConnectionState('connecting');
    try {
      // Get ephemeral token from server
      const tokenRes = await fetch('/api/realtime/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId: config.id }),
      });
      if (!tokenRes.ok) throw new Error('Failed to get session token');
      const { client_secret, systemPrompt } = await tokenRes.json();

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Play AI audio output
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audioRef.current = audio;
      pc.ontrack = (e) => { audio.srcObject = e.streams[0]; };

      // Add microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      // Data channel for events (we create it so we can send session.update)
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;
      dc.onmessage = handleDataChannelMessage;

      // Also listen for data channels created by OpenAI's side
      pc.ondatachannel = (e) => {
        e.channel.onmessage = handleDataChannelMessage;
      };

      // Configure: apply system prompt, enable input transcription
      dc.onopen = () => {
        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            instructions: systemPrompt,
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: { type: 'server_vad', threshold: 0.9, silence_duration_ms: 700 },
          }
        }));
      };

      // SDP exchange
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpForm = new FormData();
      sdpForm.append('sdp', offer.sdp!);
      sdpForm.append('session', JSON.stringify({ type: 'realtime', model: 'gpt-realtime-2' }));

      const sdpRes = await fetch(
        'https://api.openai.com/v1/realtime/calls',
        {
          method: 'POST',
          body: sdpForm,
          headers: {
            Authorization: `Bearer ${client_secret.value}`,
          },
        }
      );
      if (!sdpRes.ok) throw new Error('WebRTC negotiation failed');
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      setConnectionState('active');
      track(EventName.SESSION_STARTED_VOICE, { type: config.type, configId: config.id });
    } catch (err: any) {
      setConnectionState('idle');
      toast({ variant: 'destructive', title: 'Connection failed', description: err.message });
    }
  };

  const pauseSession = () => {
    streamRef.current?.getTracks().forEach(t => { t.enabled = false; });
    setIsPaused(true);
    setActivityState('idle');
  };

  const resumeSession = () => {
    streamRef.current?.getTracks().forEach(t => { t.enabled = true; });
    setIsPaused(false);
  };

  const stopSession = () => {
    track(EventName.SESSION_ENDED, { type: config.type, configId: config.id });
    pcRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
    dcRef.current = null;
    pcRef.current = null;
    streamRef.current = null;
    setConnectionState('ended');
    setActivityState('idle');
    setIsPaused(false);
  };

  const getHint = async () => {
    if (!config.feedbackCriteria) return;
    track(EventName.HINT_REQUESTED, { type: config.type, configId: config.id });
    setIsGettingHint(true);
    try {
      const res = await fetch('/api/chat-hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackCriteria: config.feedbackCriteria,
          userInstructions: config.userInstructions,
          messages: transcript,
        }),
      });
      const data = await res.json();
      toast({ title: 'Hint', description: data.message });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to get hint' });
    } finally {
      setIsGettingHint(false);
    }
  };

  const handleGetSummary = async () => {
    if (transcript.length < 2) {
      toast({ title: 'Not enough conversation yet', description: 'Have a conversation first before generating a summary.' });
      return;
    }
    setIsGettingSummary(true);
    try {
      const res = await fetch('/api/thought-partner/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: transcript,
          userInstructions: config.userInstructions,
          feedbackCriteria: config.feedbackCriteria,
          configId: config.id,
          sessionId,
        }),
      });
      if (!res.ok) throw new Error('Failed to generate summary');
      const data = await res.json();
      setSummaryData(data);
      setSummaryOpen(true);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to generate summary. Please try again.' });
    } finally {
      setIsGettingSummary(false);
    }
  };

  const confirmFeedback = async () => {
    setIsConfirmingFeedback(false);
    track(EventName.FEEDBACK_REQUESTED, { type: config.type, configId: config.id });
    setIsGettingFeedback(true);
    try {
      const res = await fetch('/api/chat-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configId: config.id,
          sessionId,
          messages: transcript,
          type: 'chat',
          userName,
          chatMode: 'spoken',
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setFeedbackData(data);
      if (data.score != null) track(EventName.FEEDBACK_SCORE, { type: config.type, configId: config.id, score: data.score });
      setFeedbackOpen(true);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setIsGettingFeedback(false);
    }
  };

  // Orb colour and animation
  const orbColour = {
    idle: 'bg-gray-100 shadow-gray-200',
    listening: 'bg-green-100 shadow-green-300',
    speaking: 'bg-blue-100 shadow-blue-300',
  }[activityState];

  const orbPulse = activityState !== 'idle' ? 'animate-pulse' : '';

  const statusLabel = isPaused
    ? 'Paused — microphone off'
    : {
      idle: connectionState === 'active' ? 'Ready — speak when you like' : '',
      listening: 'Listening...',
      speaking: 'Speaking...',
    }[activityState];

  return (
    <div className="space-y-2">
      {showNameModal && (
        <UserNameModal
          open={showNameModal}
          interactionMode={config.interactionMode}
          onSubmit={(name, mode) => onUserNameSubmit(name, mode)}
        />
      )}

      {/* Instructions */}
      {config.userInstructions && (
        <Collapsible open={instructionsOpen} onOpenChange={setInstructionsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full flex justify-between">
              <span className="flex items-center gap-2"><Info className="h-4 w-4" /> Instructions</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${instructionsOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="text-sm text-muted-foreground px-2 py-3 space-y-1">
              {config.userInstructions!.split('\n').map((line, i) => {
                const bullet = line.match(/^[-–•]\s+(.*)/);
                if (bullet) {
                  return (
                    <div key={i} className="flex gap-2">
                      <span className="text-gray-400 mt-0.5">•</span>
                      <span>{bullet[1]}</span>
                    </div>
                  );
                }
                return line.trim() ? <p key={i} className="font-medium text-gray-700">{line}</p> : null;
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Orb */}
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="relative flex items-center justify-center">
          {/* Outer ripple rings when active */}
          {connectionState === 'active' && activityState !== 'idle' && (
            <>
              <div className={`absolute rounded-full w-48 h-48 opacity-20 animate-ping ${activityState === 'listening' ? 'bg-green-400' : 'bg-blue-400'}`} />
              <div className={`absolute rounded-full w-40 h-40 opacity-30 animate-ping [animation-delay:150ms] ${activityState === 'listening' ? 'bg-green-400' : 'bg-blue-400'}`} />
            </>
          )}
          {/* Main orb */}
          <div className={`relative rounded-full w-32 h-32 shadow-xl transition-all duration-500 flex items-center justify-center ${orbColour} ${orbPulse}`}>
            {connectionState === 'connecting' ? (
              <div className="h-8 w-8 rounded-full border-4 border-gray-400 border-t-transparent animate-spin" />
            ) : connectionState === 'active' && isPaused ? (
              <PauseCircle className="h-10 w-10 text-gray-400" />
            ) : connectionState === 'active' ? (
              <Mic className={`h-10 w-10 transition-colors ${activityState === 'listening' ? 'text-green-600' : activityState === 'speaking' ? 'text-blue-600' : 'text-gray-400'}`} />
            ) : (
              <Mic className="h-10 w-10 text-gray-300" />
            )}
          </div>
        </div>

        {/* Status label */}
        <p className="text-sm text-muted-foreground h-5">{statusLabel}</p>

        {/* Start / Stop */}
        {connectionState === 'idle' && (
          <Button onClick={startSession} size="lg" className="px-10">
            Start Session
          </Button>
        )}
        {connectionState === 'connecting' && (
          <Button disabled size="lg" className="px-10">Connecting...</Button>
        )}
        {connectionState === 'active' && isThoughtPartner && !isPaused && (
          <Button onClick={pauseSession} variant="outline" size="lg" className="px-10">
            <PauseCircle className="h-4 w-4 mr-2" /> Pause
          </Button>
        )}
        {connectionState === 'active' && isThoughtPartner && isPaused && (
          <div className="flex flex-col items-center gap-3">
            <Button onClick={resumeSession} size="lg" className="px-10">
              <PlayCircle className="h-4 w-4 mr-2" /> Resume
            </Button>
            <Button onClick={stopSession} variant="ghost" size="sm" className="text-red-500 hover:text-red-600">
              <MicOff className="h-4 w-4 mr-1" /> End Session
            </Button>
          </div>
        )}
        {connectionState === 'active' && !isThoughtPartner && !isPaused && (
          <Button onClick={pauseSession} variant="destructive" size="lg" className="px-10">
            <MicOff className="h-4 w-4 mr-2" /> Stop Conversation
          </Button>
        )}
        {connectionState === 'active' && !isThoughtPartner && isPaused && (
          <div className="flex flex-col items-center gap-3">
            <Button onClick={resumeSession} size="lg" className="px-10">
              <PlayCircle className="h-4 w-4 mr-2" /> Continue Conversation
            </Button>
            <Button onClick={stopSession} variant="ghost" size="sm" className="text-red-500 hover:text-red-600">
              <MicOff className="h-4 w-4 mr-1" /> Finish Session
            </Button>
          </div>
        )}
        {connectionState === 'ended' && (
          <Button onClick={() => { setConnectionState('idle'); setTranscript([]); capturedResponseIds.current.clear(); }} variant="outline" size="lg" className="px-10">
            Start Again
          </Button>
        )}
      </div>

      {/* Summary / Hint / Feedback */}
      {connectionState !== 'idle' && (
        isThoughtPartner ? (
          <div className="flex justify-center">
            <Button
              size="sm"
              onClick={summaryData ? () => setSummaryOpen(true) : handleGetSummary}
              disabled={isGettingSummary || transcript.length < 2}
              className={summaryData ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
              variant={summaryData ? 'default' : 'outline'}
            >
              <Brain className="h-4 w-4 mr-1" />
              {isGettingSummary ? 'Building thinking map...' : summaryData ? 'View Thinking Map' : 'Get Thinking Map'}
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={getHint}
              disabled={isGettingHint || connectionState === 'idle' || connectionState === 'connecting'}
            >
              <Lightbulb className="h-4 w-4 mr-1" />
              {isGettingHint ? 'Getting hint...' : 'Hint'}
            </Button>
            <Button
              variant={feedbackData ? 'default' : 'outline'}
              size="sm"
              onClick={() => feedbackData ? setFeedbackOpen(true) : setIsConfirmingFeedback(true)}
              disabled={isGettingFeedback || (connectionState !== 'ended' && !hasEnoughMessages)}
              className={feedbackData ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              <Trophy className="h-4 w-4 mr-1" />
              {isGettingFeedback ? 'Analysing...' : feedbackData ? 'View Feedback' : 'Get Feedback'}
            </Button>
          </div>
        )
      )}

      {/* Transcript (collapsible, shown when ended) */}
      {connectionState === 'ended' && transcript.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full flex justify-between text-muted-foreground">
              <span>View transcript ({transcript.length} turns)</span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-2 pt-2 max-h-60 overflow-y-auto">
              {transcript.map((m) => (
                <div key={m.id} className={`text-sm px-3 py-2 rounded-lg ${m.role === 'user' ? 'bg-blue-50 ml-8' : 'bg-gray-50 mr-8'}`}>
                  <span className="font-medium text-xs text-muted-foreground block mb-1">
                    {m.role === 'user' ? (userName || 'You') : 'AI'}
                  </span>
                  {typeof m.content === 'string' ? m.content : m.content.text}
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Feedback confirm dialog */}
      <AlertDialog open={isConfirmingFeedback} onOpenChange={setIsConfirmingFeedback}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Get Feedback?</AlertDialogTitle>
            <AlertDialogDescription>
              This will analyse your conversation and provide feedback. You can still continue talking after.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmFeedback}>Get Feedback</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Feedback display */}
      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Your Feedback</DialogTitle>
          </DialogHeader>
          {feedbackData && (
            <div className="space-y-4 pt-2">
              {feedbackData.score !== undefined && (
                <div className="flex items-center justify-center">
                  <div className="text-5xl font-bold text-green-600">{feedbackData.score}<span className="text-2xl text-muted-foreground">/10</span></div>
                </div>
              )}
              {feedbackData.summary && (
                <p className="text-sm text-muted-foreground text-center italic">{feedbackData.summary}</p>
              )}
              <ul className="space-y-2">
                {feedbackData.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-green-500 mt-0.5">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Thinking map for thought-partner */}
      <ThinkingMapModal
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        summary={summaryData}
      />

      <div className="mt-auto py-2 text-center text-xs text-gray-400">
        Your trainer has access to the transcript and feedback.
      </div>
    </div>
  );
}
