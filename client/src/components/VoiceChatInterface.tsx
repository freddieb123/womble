import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Lightbulb, Trophy, ChevronDown, Info, Brain, PauseCircle, PlayCircle, Loader2, Copy, Check, Keyboard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AdminConfig, Message } from "@/lib/types";
import UserNameModal from "./UserNameModal";
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
import LeaderboardModal from "./LeaderboardModal";

interface LeaderboardEntry {
  userName: string;
  score: number;
  total: number;
  rank?: number;
  isTied?: boolean;
  isCurrentUser: boolean;
}

interface ThinkingMap {
  keyThemes: string[];
  insights: string[];
  openQuestions: string[];
  nextSteps: string[];
}

interface AttemptData {
  attemptNumber: number;
  chatMode: string | null;
  feedback: { bullets: string[]; score?: number | null; summary?: string | null; thinkingMap?: ThinkingMap } | null;
}

interface Props {
  config: AdminConfig;
  sessionId: string;
  userName: string | null;
  attemptNumber?: number;
  onUserNameSubmit: (name: string, mode?: 'typed' | 'spoken') => string;
  onSwitchMode?: (mode: 'typed' | 'spoken') => void;
}

type ConnectionState = 'idle' | 'connecting' | 'active' | 'ended';
type ActivityState = 'idle' | 'listening' | 'speaking';

function messageText(content: Message['content']) {
  return typeof content === 'string' ? content : content.text;
}

function normaliseTranscriptText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function mergeTranscriptText(existing: string, incoming: string) {
  const current = normaliseTranscriptText(existing);
  const next = normaliseTranscriptText(incoming);
  if (!current) return next;
  if (!next || current === next || current.includes(next)) return current;
  if (next.includes(current)) return next;
  return `${current} ${next}`;
}

function hasUserMessages(messages: Message[]) {
  return messages.some(message => message.role === 'user' && normaliseTranscriptText(messageText(message.content)));
}

export default function VoiceChatInterface({ config, sessionId, userName, attemptNumber = 1, onUserNameSubmit, onSwitchMode }: Props) {
  const [showNameModal, setShowNameModal] = useState(!userName);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [activityState, setActivityState] = useState<ActivityState>('idle');
  const [transcript, setTranscript] = useState<Message[]>([]);
  const [isGettingHint, setIsGettingHint] = useState(false);
  const [isGettingFeedback, setIsGettingFeedback] = useState(false);
  const [isConfirmingFeedback, setIsConfirmingFeedback] = useState(false);
  const [feedbackData, setFeedbackData] = useState<{ bullets: string[]; score?: number; summary?: string } | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [allAttempts, setAllAttempts] = useState<AttemptData[]>([]);
  const [instructionsOpen, setInstructionsOpen] = useState(true);
  const [isGettingSummary, setIsGettingSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [currentUserEntry, setCurrentUserEntry] = useState<LeaderboardEntry | null>(null);
  const [userRank, setUserRank] = useState<number>();

  const isThoughtPartner = (config.type as string) === 'thought-partner';
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const [confirmSwitchMode, setConfirmSwitchMode] = useState(false);

  const { data: existingAttempts = [] } = useQuery<AttemptData[]>({
    queryKey: [`/api/conversations/${config.id}/session/${sessionId}`],
    enabled: !!config.id && !!sessionId,
  });
  const existingAttempt = existingAttempts.find(a => a.attemptNumber === attemptNumber) ?? existingAttempts[0];
  const isComplete = isThoughtPartner
    ? summaryData !== null || existingAttempt?.feedback?.thinkingMap != null
    : feedbackData !== null || (existingAttempt?.feedback?.score != null);
  const displayFeedback = feedbackData ?? existingAttempt?.feedback ?? null;
  const displayThinkingMap: ThinkingMap | null = summaryData ?? existingAttempt?.feedback?.thinkingMap ?? null;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptMessageIds = useRef<Map<string, string>>(new Map());
  const transcriptRef = useRef<Message[]>([]);
  const partialTranscriptRef = useRef<Map<string, { role: 'user' | 'assistant'; text: string }>>(new Map());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const utteranceChunksRef = useRef<BlobPart[]>([]);
  const isRecordingUtteranceRef = useRef(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Tear down WebRTC on unmount so the old connection doesn't keep running
  // after the user navigates to another activity (which would cause two concurrent AI voices)
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
      mediaRecorderRef.current = null;
      if (audioRef.current) {
        audioRef.current.srcObject = null;
        audioRef.current = null;
      }
      pcRef.current?.close();
      streamRef.current?.getTracks().forEach(t => t.stop());
      dcRef.current = null;
      pcRef.current = null;
      streamRef.current = null;
    };
  }, []);

  // Persist transcript to DB whenever it updates so live stats & admin count work
  useEffect(() => {
    transcriptRef.current = transcript;
    if (transcript.length === 0 || !config.id || !sessionId) return;
    fetch('/api/conversations/save-transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configId: config.id, sessionId, userName, chatMode: 'spoken', messages: transcript, attemptNumber }),
    }).catch(() => {});
  }, [transcript, config.id, sessionId, userName, attemptNumber]);

  const hasEnoughMessages = transcript.length >= 4;

  const addMessage = useCallback((role: 'user' | 'assistant', content: string, keys: string[] = []) => {
    const text = normaliseTranscriptText(content);
    if (!text) return;

    setTranscript(prev => {
      const existingId = keys.map(key => transcriptMessageIds.current.get(key)).find(Boolean);
      let nextTranscript: Message[];

      if (existingId) {
        for (const key of keys) transcriptMessageIds.current.set(key, existingId);
        nextTranscript = prev.map(message => {
          if (message.id !== existingId) return message;
          const merged = mergeTranscriptText(messageText(message.content), text);
          return { ...message, content: merged, timestamp: Date.now() };
        });
        transcriptRef.current = nextTranscript;
        return nextTranscript;
      }

      const last = prev[prev.length - 1];
      const shouldMergeWithLast =
        keys.length === 0 &&
        last?.role === role &&
        Date.now() - last.timestamp < 1500 &&
        (messageText(last.content).includes(text) || text.includes(messageText(last.content)));

      if (shouldMergeWithLast) {
        nextTranscript = prev.map(message => {
          if (message.id !== last.id) return message;
          return { ...message, content: mergeTranscriptText(messageText(message.content), text), timestamp: Date.now() };
        });
        transcriptRef.current = nextTranscript;
        return nextTranscript;
      }

      const id = uuidv4();
      for (const key of keys) transcriptMessageIds.current.set(key, id);
      nextTranscript = [...prev, { id, role, content: text, timestamp: Date.now(), sessionId }];
      transcriptRef.current = nextTranscript;
      return nextTranscript;
    });
  }, [sessionId]);

  const getTranscriptKeys = (role: 'user' | 'assistant', msg: any) => [
    msg.response_id && `${role}:response:${msg.response_id}`,
    msg.item_id && `${role}:item:${msg.item_id}`,
    msg.item_id && msg.content_index != null && `${role}:item:${msg.item_id}:content:${msg.content_index}`,
    msg.output_index != null && `${role}:output:${msg.output_index}`,
  ].filter(Boolean) as string[];

  const appendPartialTranscript = (role: 'user' | 'assistant', text: string | undefined, keys: string[]) => {
    const delta = text ?? '';
    if (!delta.trim() || keys.length === 0) return;
    const primaryKey = keys[0];
    const current = partialTranscriptRef.current.get(primaryKey);
    const nextText = `${current?.text ?? ''}${delta}`;
    const next = { role, text: nextText };
    for (const key of keys) partialTranscriptRef.current.set(key, next);
  };

  const commitTranscript = (role: 'user' | 'assistant', text: string | undefined, keys: string[]) => {
    const partial = keys.map(key => partialTranscriptRef.current.get(key)?.text).find(Boolean);
    const finalText = text?.trim() || partial?.trim();
    if (!finalText) return;
    addMessage(role, finalText, keys);
    for (const key of keys) partialTranscriptRef.current.delete(key);
  };

  const getItemText = (item: any) => {
    const content = Array.isArray(item?.content) ? item.content : [];
    const parts = content
      .map((part: any) => part?.transcript || part?.text)
      .filter((text: any) => typeof text === 'string' && text.trim());
    return parts.join(' ').trim();
  };

  const handleDataChannelMessage = useCallback((event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);
      console.log('[voice]', msg.type, msg);

      if (msg.type === 'input_audio_buffer.speech_started') {
        setActivityState('listening');
        const mr = mediaRecorderRef.current;
        if (mr && mr.state === 'inactive') {
          utteranceChunksRef.current = [];
          isRecordingUtteranceRef.current = true;
          mr.start();
        }
      }
      if (msg.type === 'input_audio_buffer.speech_stopped') {
        setActivityState('idle');
      }
      if (msg.type === 'input_audio_buffer.committed') {
        const mr = mediaRecorderRef.current;
        if (mr && mr.state === 'recording' && isRecordingUtteranceRef.current) {
          isRecordingUtteranceRef.current = false;
          mr.stop();
        }
      }
      if (msg.type === 'response.audio.delta' || msg.type === 'response.output_audio.delta') {
        setActivityState('speaking');
      }
      if (msg.type === 'response.audio.done' || msg.type === 'response.output_audio.done') {
        setActivityState('idle');
      }
      // User speech transcription events
      if (msg.type?.includes('input_audio_transcription.delta')) {
        appendPartialTranscript('user', msg.delta, getTranscriptKeys('user', msg));
      }
      if (msg.type?.includes('input_audio_transcription.completed') || msg.type?.includes('input_audio_transcription.done')) {
        commitTranscript('user', msg.transcript, getTranscriptKeys('user', msg));
      }
      // conversation.item.added / created — try to get transcript text for user items
      if ((msg.type === 'conversation.item.created' || msg.type === 'conversation.item.added') && msg.item?.role === 'user') {
        const text = getItemText(msg.item);
        if (text) commitTranscript('user', text, [msg.item.id && `user:item:${msg.item.id}`].filter(Boolean) as string[]);
      }
      // conversation.item.done — user item may have transcript by this point
      if (msg.type === 'conversation.item.done' && msg.item?.role === 'user') {
        const text = getItemText(msg.item);
        if (text) commitTranscript('user', text, [msg.item.id && `user:item:${msg.item.id}`].filter(Boolean) as string[]);
      }

      // Assistant audio transcript — direct setTranscript to avoid stale-closure issues with addMessage
      if (msg.type === 'response.output_audio_transcript.done' && msg.transcript?.trim()) {
        const text = msg.transcript.trim();
        const key = [msg.item_id && `assistant:item:${msg.item_id}`].filter(Boolean) as string[];
        setTranscript(prev => {
          if (key.length && prev.some(m => m.id === transcriptMessageIds.current.get(key[0]!))) return prev;
          const id = `dc-${msg.item_id || Date.now()}`;
          if (key.length) transcriptMessageIds.current.set(key[0]!, id);
          const next = [...prev, { id, role: 'assistant' as const, content: text, timestamp: Date.now(), sessionId }];
          transcriptRef.current = next;
          return next;
        });
      }
      // Older event name variants
      if (msg.type?.includes('audio_transcript.delta')) {
        appendPartialTranscript('assistant', msg.delta, getTranscriptKeys('assistant', msg));
      }
      if (msg.type?.includes('audio_transcript.done') && msg.type !== 'response.output_audio_transcript.done') {
        commitTranscript('assistant', msg.transcript, getTranscriptKeys('assistant', msg));
      }
      // response.done — reliable fallback containing full output with transcripts
      if (msg.type === 'response.done') {
        const responseId = msg.response?.id;
        const output: any[] = msg.response?.output ?? [];
        for (const item of output) {
          const itemText = getItemText(item);
          if (!itemText) continue;
          const role = item.role === 'user' ? 'user' : item.role === 'assistant' ? 'assistant' : null;
          if (!role) continue;
          const keys = [
            responseId && `${role}:response:${responseId}`,
            item.id && `${role}:item:${item.id}`,
          ].filter(Boolean) as string[];
          commitTranscript(role, itemText, keys);
        }
      }
    } catch {}
  }, [addMessage]);

  const startSession = async () => {
    setConnectionState('connecting');
    transcriptMessageIds.current.clear();
    partialTranscriptRef.current.clear();
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

      // MediaRecorder: capture each user utterance for Whisper transcription
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size > 0) utteranceChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const chunks = utteranceChunksRef.current.splice(0);
        if (!chunks.length) return;
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size < 1000) return; // skip very short noise bursts
        try {
          const fd = new FormData();
          fd.append('audio', blob, 'utterance.webm');
          const r = await fetch('/api/voice/transcribe-chunk', { method: 'POST', body: fd });
          if (!r.ok) return;
          const { text } = await r.json();
          if (text?.trim()) addMessage('user', text.trim());
        } catch {}
      };

      // chat activities use a higher VAD threshold + longer silence to reduce false interruptions
      const isChatType = (config.type as string) === 'chat' || (config.type as string) === 'two-way-conversation';

      // Data channel for events
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;
      dc.onmessage = handleDataChannelMessage;
      pc.ondatachannel = (e) => { e.channel.onmessage = handleDataChannelMessage; };

      dc.onopen = () => {
        // Enable user speech transcription (try gpt-4o-transcribe for gpt-realtime-2 compatibility)
        dc.send(JSON.stringify({
          type: 'session.update',
          session: { input_audio_transcription: { model: 'gpt-4o-transcribe' } },
        }));
        // VAD only — instructions already set via the calls session config
        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            turn_detection: {
              type: 'server_vad',
              threshold: isChatType ? 0.95 : 0.9,
              silence_duration_ms: isChatType ? 1500 : 1000,
            },
          },
        }));
        if (isChatType) {
          dc.send(JSON.stringify({ type: 'response.cancel' }));
        }
      };

      // SDP exchange
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpForm = new FormData();
      sdpForm.append('sdp', offer.sdp!);
      sdpForm.append('session', JSON.stringify({ type: 'realtime', instructions: systemPrompt }));

      const sdpRes = await fetch(
        'https://api.openai.com/v1/realtime/calls',
        {
          method: 'POST',
          body: sdpForm,
          headers: { Authorization: `Bearer ${client_secret.value}` },
        }
      );
      if (!sdpRes.ok) {
        const errBody = await sdpRes.text().catch(() => '');
        throw new Error(`WebRTC negotiation failed (${sdpRes.status}): ${errBody}`);
      }
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
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
    pcRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
    dcRef.current = null;
    pcRef.current = null;
    streamRef.current = null;
    setConnectionState('ended');
    setActivityState('idle');
    setIsPaused(false);
  };

  const finishAndGetFeedback = () => {
    // Mute mic but keep connection alive briefly so final transcription events can arrive
    streamRef.current?.getTracks().forEach(t => { t.enabled = false; });
    setTimeout(() => {
      stopSession();
      // Extra delay after closing so connectionState updates before reading transcript
      setTimeout(() => {
        if (isThoughtPartner) {
          handleGetSummary();
        } else {
          confirmFeedback();
        }
      }, 100);
    }, 800);
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

  const getSavedTranscript = async () => {
    try {
      const res = await fetch(`/api/conversations/${config.id}/session/${sessionId}`);
      if (!res.ok) return [];
      const attempts = await res.json();
      const currentAttempt = attempts.find((attempt: any) => attempt.attemptNumber === attemptNumber) ?? attempts[0];
      return Array.isArray(currentAttempt?.messages) ? currentAttempt.messages : [];
    } catch {
      return [];
    }
  };

  const getBestTranscript = async () => {
    const currentTranscript = transcriptRef.current.length >= transcript.length ? transcriptRef.current : transcript;
    const savedTranscript = await getSavedTranscript();

    if (hasUserMessages(currentTranscript)) return currentTranscript;
    if (hasUserMessages(savedTranscript)) return savedTranscript;
    return currentTranscript.length >= savedTranscript.length ? currentTranscript : savedTranscript;
  };

  const handleGetSummary = async () => {
    const messages = await getBestTranscript();

    if (messages.length < 2) {
      toast({ title: 'Not enough conversation yet', description: 'Have a conversation first before generating a summary.' });
      return;
    }
    setIsGettingSummary(true);
    try {
      const res = await fetch('/api/thought-partner/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          userInstructions: config.userInstructions,
          feedbackCriteria: config.feedbackCriteria,
          configId: config.id,
          sessionId,
        }),
      });
      if (!res.ok) throw new Error('Failed to generate summary');
      const data = await res.json();
      setSummaryData(data);
      queryClient.setQueryData<AttemptData[]>(
        [`/api/conversations/${config.id}/session/${sessionId}`],
        (old = []) => {
          const updated: AttemptData = { attemptNumber, chatMode: 'spoken', feedback: { bullets: [], score: null, thinkingMap: data } };
          return [updated, ...(old).filter(a => a.attemptNumber !== attemptNumber)];
        }
      );
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
      const messages = await getBestTranscript();

      if (messages.length === 0) {
        throw new Error("No conversation was captured. Please try again.");
      }

      const res = await fetch('/api/chat-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configId: config.id,
          sessionId,
          messages,
          type: 'chat',
          userName,
          chatMode: 'spoken',
          attemptNumber,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setFeedbackData(data);
      if (data.score != null) track(EventName.FEEDBACK_SCORE, { type: config.type, configId: config.id, score: data.score });
      queryClient.setQueryData<AttemptData[]>(
        [`/api/conversations/${config.id}/session/${sessionId}`],
        (old = []) => {
          const updated: AttemptData = { attemptNumber, chatMode: 'spoken', feedback: { bullets: data.bullets, score: data.score, summary: data.summary } };
          return [updated, ...(old).filter(a => a.attemptNumber !== attemptNumber)];
        }
      );

      // Fetch all attempts to display history
      const attemptsRes = await fetch(`/api/conversations/${config.id}/session/${sessionId}`);
      if (attemptsRes.ok) setAllAttempts(await attemptsRes.json());

      setFeedbackOpen(true);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setIsGettingFeedback(false);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const params = new URLSearchParams();
      if (sessionId) params.set('sessionId', sessionId);
      if (userName) params.set('userName', userName);
      const response = await fetch(`/api/final-leaderboard/${config.id}?${params}`);
      if (!response.ok) throw new Error('Failed to fetch leaderboard data');
      const { entries, currentUserEntry: cue } = await response.json();
      setLeaderboardData(entries);
      setCurrentUserEntry(cue || null);
      if (cue?.rank) setUserRank(cue.rank);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load leaderboard data' });
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

  const showOrb = !isComplete || isGettingFeedback || isGettingSummary;

  return (
    <div className="flex flex-col h-full">
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

      {/* Mode switch link — only when interactionMode=both and not yet complete */}
      {onSwitchMode && showOrb && (
        <div className="flex justify-center pt-1">
          <button
            onClick={() => setConfirmSwitchMode(true)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1.5"
          >
            <Keyboard className="h-3 w-3" />Switch to Typed
          </button>
        </div>
      )}

      {/* Orb — hidden once summary/feedback is showing */}
      {showOrb && <div className="flex flex-col items-center gap-4 py-4">
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
        {!isComplete && connectionState === 'idle' && (
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
            <Button onClick={() => setIsConfirmingFeedback(true)} variant="outline" size="sm" className="border-green-600 text-green-700 hover:bg-green-50">
              End & Get Summary
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
            <Button onClick={() => setIsConfirmingFeedback(true)} variant="outline" size="lg" className="px-10 border-green-600 text-green-700 hover:bg-green-50" disabled={isGettingFeedback}>
              <Trophy className="h-4 w-4 mr-2" />End & Get Feedback
            </Button>
          </div>
        )}
        {(connectionState === 'ended' || (connectionState === 'idle' && isComplete)) && (isGettingFeedback || isGettingSummary) && (
          <Button disabled size="lg" className="px-10">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />{isThoughtPartner ? "Generating summary..." : "Generating feedback..."}
          </Button>
        )}
      </div>}

      {/* Inline feedback / thinking map — shown once complete, fills remaining height */}
      {isComplete && !isGettingFeedback && !isGettingSummary && (
        <div className="flex-1 min-h-0 px-4 py-4 space-y-4 border-t bg-gray-50 overflow-y-auto">
          {isThoughtPartner && displayThinkingMap ? (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Brain className="h-4 w-4 text-green-600" />Your Thinking Map
                </div>
                <button
                  onClick={() => {
                    const sections: string[] = [];
                    if (displayThinkingMap.keyThemes?.length) sections.push(`Key Themes Explored\n${displayThinkingMap.keyThemes.map(t => `• ${t}`).join('\n')}`);
                    if (displayThinkingMap.insights?.length) sections.push(`Insights Reached\n${displayThinkingMap.insights.map(t => `• ${t}`).join('\n')}`);
                    if (displayThinkingMap.openQuestions?.length) sections.push(`Open Questions\n${displayThinkingMap.openQuestions.map(t => `• ${t}`).join('\n')}`);
                    if (displayThinkingMap.nextSteps?.length) sections.push(`Suggested Next Steps\n${displayThinkingMap.nextSteps.map(t => `• ${t}`).join('\n')}`);
                    navigator.clipboard.writeText(sections.join('\n\n')).then(() => { setCopiedFeedback(true); setTimeout(() => setCopiedFeedback(false), 2000); });
                  }}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded"
                  title="Copy to clipboard"
                >
                  {copiedFeedback ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              {displayThinkingMap.keyThemes?.length > 0 && <VoiceMapSection color="blue" title="Key Themes Explored" items={displayThinkingMap.keyThemes} />}
              {displayThinkingMap.insights?.length > 0 && <VoiceMapSection color="yellow" title="Insights Reached" items={displayThinkingMap.insights} />}
              {displayThinkingMap.openQuestions?.length > 0 && <VoiceMapSection color="purple" title="Open Questions" items={displayThinkingMap.openQuestions} />}
              {displayThinkingMap.nextSteps?.length > 0 && <VoiceMapSection color="green" title="Suggested Next Steps" items={displayThinkingMap.nextSteps} />}
              {displayFeedback && displayFeedback.bullets.length > 0 && (
                <div className="pt-2 border-t space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Feedback</span>
                    {displayFeedback.score != null && <span className="text-sm font-bold text-blue-900">{displayFeedback.score}/10</span>}
                  </div>
                  {displayFeedback.bullets.map((b, i) => (
                    <div key={i} className="flex gap-2 text-sm text-gray-700"><span className="text-green-500 mt-0.5">•</span><span>{b}</span></div>
                  ))}
                  {displayFeedback.summary && <p className="text-sm text-muted-foreground italic">{displayFeedback.summary}</p>}
                </div>
              )}
            </>
          ) : displayFeedback ? (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Trophy className="h-4 w-4 text-blue-600" />Session Complete
                  {displayFeedback.score != null && <span className="text-blue-900 font-bold">{displayFeedback.score}/10</span>}
                </div>
                <button
                  onClick={() => {
                    const text = [...(displayFeedback.bullets || []).map(b => `• ${b}`), displayFeedback.summary].filter(Boolean).join('\n');
                    navigator.clipboard.writeText(text).then(() => { setCopiedFeedback(true); setTimeout(() => setCopiedFeedback(false), 2000); });
                  }}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded"
                  title="Copy to clipboard"
                >
                  {copiedFeedback ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              {displayFeedback.bullets.map((b, i) => (
                <div key={i} className="flex gap-2 text-sm text-gray-700"><span className="text-green-500 mt-0.5">•</span><span>{b}</span></div>
              ))}
              {displayFeedback.summary && <p className="text-sm text-muted-foreground italic">{displayFeedback.summary}</p>}
              <Button size="sm" variant="outline" className="w-full" onClick={() => { fetchLeaderboard(); setShowLeaderboard(true); }}>
                <Trophy className="h-4 w-4 mr-2" />View Leaderboard
              </Button>
            </>
          ) : null}
        </div>
      )}

      {/* Feedback display */}
      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Feedback</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {[
              allAttempts.find(attempt => attempt.attemptNumber === attemptNumber)
                ?? allAttempts[0]
                ?? (feedbackData ? { attemptNumber, chatMode: 'spoken', feedback: feedbackData } : null),
            ].filter((attempt): attempt is AttemptData => attempt !== null).map((attempt, idx) => (
              <Collapsible key={attempt.attemptNumber} defaultOpen={idx === 0}>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between w-full px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Feedback</span>
                      {attempt.chatMode === 'spoken' ? (
                        <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Voice</span>
                      ) : (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Typed</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {attempt.feedback?.score != null && (
                        <span className="text-sm font-bold text-blue-900">{attempt.feedback.score}/10</span>
                      )}
                      <ChevronDown className="h-4 w-4 text-gray-400 transition-transform [[data-state=open]_&]:rotate-180" />
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-3 pt-2 pb-3 space-y-2">
                    {attempt.feedback?.bullets?.map((b, i) => (
                      <div key={i} className="flex gap-2 text-sm">
                        <span className="text-green-500 mt-0.5">•</span><span>{b}</span>
                      </div>
                    ))}
                    {attempt.feedback?.summary && (
                      <p className="text-sm text-muted-foreground italic">{attempt.feedback.summary}</p>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
          <div className="pt-2 border-t flex flex-col gap-2">
            <Button
              onClick={() => { fetchLeaderboard(); setShowLeaderboard(true); }}
              variant="outline"
              className="w-full"
            >
              <Trophy className="h-4 w-4 mr-2" />
              View Leaderboard
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <LeaderboardModal
        open={showLeaderboard}
        onOpenChange={setShowLeaderboard}
        entries={leaderboardData}
        currentUserRank={userRank}
        currentUserEntry={currentUserEntry}
        title="Final Leaderboard"
        maxScore={10}
        onRefresh={fetchLeaderboard}
      />

      <AlertDialog open={isConfirmingFeedback} onOpenChange={setIsConfirmingFeedback}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isThoughtPartner ? "End & Get Summary?" : "End & Get Feedback?"}</AlertDialogTitle>
            <AlertDialogDescription>
              This will end your session and generate your {isThoughtPartner ? "summary" : "feedback"}. You can dismiss this to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue session</AlertDialogCancel>
            <AlertDialogAction onClick={finishAndGetFeedback}>{isThoughtPartner ? "End & Get Summary" : "End & Get Feedback"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmSwitchMode} onOpenChange={setConfirmSwitchMode}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to Typed?</AlertDialogTitle>
            <AlertDialogDescription>
              Switching will discard your current conversation and start this activity again in typed mode. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay in Voice</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmSwitchMode(false); onSwitchMode?.('typed'); }}>
              Switch to Typed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex-shrink-0 py-2 text-center text-xs text-gray-400">
        Your trainer has access to the transcript and feedback.
      </div>
    </div>
  );
}

const voiceSectionColors = {
  blue:   { card: 'bg-blue-50 border-blue-100',   dot: 'bg-blue-400' },
  yellow: { card: 'bg-yellow-50 border-yellow-100', dot: 'bg-yellow-400' },
  purple: { card: 'bg-purple-50 border-purple-100', dot: 'bg-purple-400' },
  green:  { card: 'bg-green-50 border-green-100',  dot: 'bg-green-500' },
} as const;

function VoiceMapSection({ color, title, items }: { color: keyof typeof voiceSectionColors; title: string; items: string[] }) {
  const { card, dot } = voiceSectionColors[color];
  return (
    <div className={`rounded-lg border p-3 ${card}`}>
      <p className="font-semibold text-xs text-gray-600 mb-2">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
            <span className={`mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0 ${dot}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
