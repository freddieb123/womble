import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import WombleHeader from "@/components/WombleHeader";
import WombleFooter from "@/components/WombleFooter";
import ChatInterface from "@/components/ChatInterface";
import VoiceChatInterface from "@/components/VoiceChatInterface";
import QuizInterface from "@/components/QuizInterface";
import QuickFireQuizInterface from "@/components/QuickFireQuizInterface";
import UploadInterface from "@/components/UploadInterface";
import GroupBoardInterface from "@/components/GroupBoardInterface";
import UserTesterInterface from "@/components/UserTesterInterface";
import DocCritiqueInterface from "@/components/DocCritiqueInterface";
import TaskWalkthroughInterface from "@/components/TaskWalkthroughInterface";
import DualConversationRecorder from "@/components/DualConversationRecorder";
import ParticipantsNameModal from "@/components/ParticipantsNameModal";
import FeedbackModal from "@/components/FeedbackModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Keyboard, Mic, MessageSquare, Users, GraduationCap, Brain,
  Zap, LayoutGrid, Monitor, FileText, ClipboardList, HelpCircle, Upload,
} from "lucide-react";
import type { AdminConfig } from "@/lib/types";
import { ParticipantCount, LiveLeaderboard } from "@/components/LiveActivityPanel";

type SessionConfig = {
  id: number;
  title: string;
  type: string;
  isLive: boolean;
  interactionMode: 'typed' | 'spoken' | 'both';
  userInstructions: string | null;
  systemPrompt: string;
  feedbackCriteria: string | null;
  knowledgeLevel: number | null;
  attitude: number | null;
  coachingStyle: number | null;
  referenceImages: string[] | null;
  referenceContent: string | null;
  sessionOrder: number | null;
  groupBoardSettings?: any;
  participant1Role?: string | null;
  participant2Role?: string | null;
};

type SessionData = {
  id: number;
  shareToken: string;
  configs: SessionConfig[];
};

type LiveStatus = { configId: number; isLive: boolean }[];

const LS_NAME_KEY = 'womble_session_name';

export default function SessionView() {
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get('token');

  const [userName, setUserName] = useState<string | null>(() => localStorage.getItem(LS_NAME_KEY));
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [chatModes, setChatModes] = useState<Record<number, 'typed' | 'spoken'>>({});
  const [showModeModal, setShowModeModal] = useState(false);
  const [pendingConfigId, setPendingConfigId] = useState<number | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const isDraggingRef = useRef(false);

  // One stable sessionId per config
  const sessionIds = useRef<Record<number, string>>({});
  const getSessionId = (configId: number) => {
    if (!sessionIds.current[configId]) {
      sessionIds.current[configId] = crypto.randomUUID();
    }
    return sessionIds.current[configId];
  };

  const { data: sessionData, isLoading, error } = useQuery<SessionData>({
    queryKey: [`/api/sessions/join/${token}`],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/join/${token}`);
      if (!res.ok) throw new Error('Session not found');
      return res.json();
    },
    enabled: !!token,
    staleTime: Infinity,
    refetchInterval: 45_000,
  });

  const { data: liveStatus } = useQuery<LiveStatus>({
    queryKey: [`/api/sessions/join/${token}/status`],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/join/${token}/status`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token && !!sessionData,
    refetchInterval: 5_000,
  });

  // Merge live status into configs
  const configs = sessionData?.configs.map(c => ({
    ...c,
    isLive: liveStatus?.find(s => s.configId === c.id)?.isLive ?? c.isLive,
  })) ?? [];

  // Auto-select first live config
  useEffect(() => {
    if (selectedConfigId !== null || configs.length === 0) return;
    const firstLive = configs.find(c => c.isLive);
    if (firstLive) setSelectedConfigId(firstLive.id);
  }, [configs, selectedConfigId]);

  const handleSelectActivity = (config: SessionConfig) => {
    if (!config.isLive) return;
    // Only show mode picker when switching to a subsequent activity (name already known)
    // For the first activity, the activity's own UserNameModal handles name + mode together
    if (userName && config.interactionMode === 'both' && !chatModes[config.id] && !['group-board', 'user-tester', 'doc-critique', 'task-walkthrough', 'two-way-conversation'].includes(config.type)) {
      setPendingConfigId(config.id);
      setShowModeModal(true);
    } else {
      setSelectedConfigId(config.id);
    }
  };

  const handleModeSelect = (mode: 'typed' | 'spoken') => {
    if (pendingConfigId === null) return;
    setChatModes(prev => ({ ...prev, [pendingConfigId]: mode }));
    setSelectedConfigId(pendingConfigId);
    setPendingConfigId(null);
    setShowModeModal(false);
  };

  const handleUserNameFromActivity = (name: string, mode?: 'typed' | 'spoken') => {
    localStorage.setItem(LS_NAME_KEY, name);
    setUserName(name);
    if (mode && selectedConfigId !== null) {
      setChatModes(prev => ({ ...prev, [selectedConfigId]: mode }));
    }
    return window.location.href;
  };

  if (!token) {
    return <ErrorScreen message="No session token provided." />;
  }

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse text-gray-400">Loading session...</div>
      </div>
    );
  }

  if (error || !sessionData) {
    return <ErrorScreen message="Session not found or has expired." />;
  }

  const selectedConfig = configs.find(c => c.id === selectedConfigId);

  const adminConfig: AdminConfig | null = selectedConfig ? {
    id: selectedConfig.id,
    type: selectedConfig.type as AdminConfig['type'],
    title: selectedConfig.title,
    systemPrompt: selectedConfig.systemPrompt,
    temperature: 0.7,
    maxTokens: 1000,
    userInstructions: selectedConfig.userInstructions || '',
    feedbackCriteria: selectedConfig.feedbackCriteria || '',
    questions: [],
    knowledgeLevel: selectedConfig.knowledgeLevel ?? undefined,
    attitude: selectedConfig.attitude ?? undefined,
    coachingStyle: selectedConfig.coachingStyle ?? undefined,
    referenceImages: selectedConfig.referenceImages ?? undefined,
    referenceContent: selectedConfig.referenceContent ?? undefined,
    interactionMode: selectedConfig.interactionMode,
    groupBoardSettings: selectedConfig.groupBoardSettings ?? undefined,
    participant1Role: selectedConfig.participant1Role ?? undefined,
    participant2Role: selectedConfig.participant2Role ?? undefined,
  } : null;

  const chatMode = selectedConfig
    ? (selectedConfig.interactionMode === 'spoken'
        ? 'spoken'
        : selectedConfig.interactionMode === 'typed'
          ? 'typed'
          : chatModes[selectedConfig.id] ?? 'typed')
    : 'typed';

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <WombleHeader />

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div
          className="flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto relative"
          style={{ width: sidebarWidth }}
        >
          {/* Drag handle */}
          <div
            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-green-200 active:bg-green-300 transition-colors z-10"
            onMouseDown={(e) => {
              e.preventDefault();
              isDraggingRef.current = true;
              const startX = e.clientX;
              const startWidth = sidebarWidth;
              const onMove = (ev: MouseEvent) => {
                if (!isDraggingRef.current) return;
                const next = Math.min(400, Math.max(160, startWidth + ev.clientX - startX));
                setSidebarWidth(next);
              };
              const onUp = () => {
                isDraggingRef.current = false;
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          />
          <div className="px-3 pt-4 pb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Activities</p>
          </div>
          <nav className="flex-1 px-2 pb-4 space-y-1">
            {configs.map((cfg) => {
              const isSelected = cfg.id === selectedConfigId;
              const SidebarIcon = ({
                chat: MessageSquare,
                'two-way-conversation': Users,
                'teach-ai': GraduationCap,
                'thought-partner': Brain,
                'quick-fire-quiz': Zap,
                'group-board': LayoutGrid,
                'user-tester': Monitor,
                'doc-critique': FileText,
                'task-walkthrough': ClipboardList,
                quiz: HelpCircle,
                upload: Upload,
              } as Record<string, React.ElementType>)[cfg.type] ?? MessageSquare;
              return (
                <button
                  key={cfg.id}
                  onClick={() => handleSelectActivity(cfg)}
                  disabled={!cfg.isLive}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    !cfg.isLive
                      ? 'text-gray-300 cursor-not-allowed'
                      : isSelected
                        ? 'bg-green-50 text-green-800 font-medium'
                        : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.isLive ? 'bg-green-500' : 'bg-gray-200'}`} />
                    <SidebarIcon className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                    <span className="truncate">{cfg.title}</span>
                  </div>
                </button>
              );
            })}
          </nav>
          {userName && selectedConfig?.type !== 'quick-fire-quiz' && (
            <div className="px-3 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 truncate">{userName}</p>
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-hidden p-4 flex gap-4">
          {/* Left panel: participant count */}
          <div className="hidden lg:flex lg:flex-col w-40 flex-shrink-0 pt-1">
            {selectedConfig && ['chat', 'teach-ai', 'thought-partner', 'quiz'].includes(selectedConfig.type) && (
              <ParticipantCount configId={selectedConfig.id} />
            )}
          </div>

          {/* Centre: activity */}
          <div className="flex-1 overflow-hidden flex flex-col">
          {!selectedConfig ? (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
              Select an activity from the sidebar to get started.
            </div>
          ) : (
            <Card className={`h-full w-full flex flex-col overflow-hidden ${['group-board', 'user-tester', 'doc-critique', 'task-walkthrough', 'two-way-conversation'].includes(selectedConfig.type) ? 'max-w-6xl self-center p-0' : 'max-w-3xl self-center p-4'}`}>
              {selectedConfig.type === 'two-way-conversation' ? (
                <TwoWayConversationInSession
                  key={selectedConfig.id}
                  configId={selectedConfig.id}
                  sessionId={getSessionId(selectedConfig.id)}
                  config={adminConfig!}
                />
              ) : selectedConfig.type === 'group-board' ? (
                <GroupBoardInterface
                  config={adminConfig!}
                  userName={userName}
                  onUserNameSubmit={(name) => { handleUserNameFromActivity(name); return window.location.href; }}
                />
              ) : selectedConfig.type === 'user-tester' ? (
                <UserTesterInterface
                  key={selectedConfig.id}
                  config={adminConfig!}
                  sessionId={getSessionId(selectedConfig.id)}
                  userName={userName}
                  onUserNameSubmit={handleUserNameFromActivity}
                />
              ) : selectedConfig.type === 'doc-critique' ? (
                <DocCritiqueInterface
                  key={selectedConfig.id}
                  config={adminConfig!}
                  sessionId={getSessionId(selectedConfig.id)}
                  userName={userName}
                  onUserNameSubmit={handleUserNameFromActivity}
                />
              ) : selectedConfig.type === 'task-walkthrough' ? (
                <TaskWalkthroughInterface
                  key={selectedConfig.id}
                  config={adminConfig!}
                  sessionId={getSessionId(selectedConfig.id)}
                  userName={userName}
                  onUserNameSubmit={handleUserNameFromActivity}
                />
              ) : chatMode === 'spoken' ? (
                <VoiceChatInterface
                  config={adminConfig!}
                  sessionId={getSessionId(selectedConfig.id)}
                  userName={userName}
                  onUserNameSubmit={handleUserNameFromActivity}
                />
              ) : selectedConfig.type === 'quick-fire-quiz' ? (
                <QuickFireQuizInterface
                  configId={selectedConfig.id}
                  userName={userName}
                />
              ) : selectedConfig.type === 'quiz' ? (
                <QuizInterface
                  config={adminConfig!}
                  sessionId={getSessionId(selectedConfig.id)}
                  userName={userName}
                  onUserNameSubmit={handleUserNameFromActivity}
                  isViewOnly={false}
                />
              ) : selectedConfig.type === 'upload' ? (
                <UploadInterface
                  config={adminConfig!}
                  sessionId={getSessionId(selectedConfig.id)}
                  userName={userName}
                  onUserNameSubmit={handleUserNameFromActivity}
                />
              ) : (
                <ChatInterface
                  config={adminConfig!}
                  sessionId={getSessionId(selectedConfig.id)}
                  userName={userName}
                  isViewOnly={false}
                  onUserNameSubmit={handleUserNameFromActivity}
                />
              )}
            </Card>
          )}
          </div>

          {/* Right panel: leaderboard + timer */}
          <div className="hidden lg:flex lg:flex-col w-48 flex-shrink-0 pt-1 gap-3">
            {selectedConfig && ['chat', 'teach-ai'].includes(selectedConfig.type) && (
              <LiveLeaderboard configId={selectedConfig.id} />
            )}
            {selectedConfig && TIMER_TYPES.has(selectedConfig.type) && (
              <ActivityTimerDisplay configId={selectedConfig.id} />
            )}
          </div>
        </div>
      </div>

      <WombleFooter />

      {/* Mode modal (per-activity, shown when interactionMode === 'both') */}
      <Dialog open={showModeModal} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>How would you like to participate?</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button variant="outline" className="h-20 flex flex-col gap-2" onClick={() => handleModeSelect('typed')}>
              <Keyboard className="h-6 w-6" />
              <span>Typed</span>
            </Button>
            <Button variant="outline" className="h-20 flex flex-col gap-2" onClick={() => handleModeSelect('spoken')}>
              <Mic className="h-6 w-6" />
              <span>Voice</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const TIMER_TYPES = new Set(['chat', 'teach-ai', 'two-way-conversation']);

function ActivityTimerDisplay({ configId }: { configId: number }) {
  const dingFiredRef = useRef(false);
  const serverSnapRef = useRef<{ remaining: number; receivedAt: number } | null>(null);
  const [displayRemaining, setDisplayRemaining] = useState(0);

  const { data: timer } = useQuery<{ status: string; remainingSeconds: number; totalSeconds: number }>({
    queryKey: ['/api/timer', configId, 'user'],
    queryFn: async () => {
      const res = await fetch(`/api/timer/${configId}`);
      return res.json();
    },
    refetchInterval: 2000,
  });

  useEffect(() => {
    if (!timer) return;
    serverSnapRef.current = { remaining: timer.remainingSeconds, receivedAt: Date.now() };
    setDisplayRemaining(timer.remainingSeconds);
  }, [timer]);

  useEffect(() => {
    if (timer?.status !== 'running') return;
    const id = setInterval(() => {
      if (!serverSnapRef.current) return;
      const elapsed = (Date.now() - serverSnapRef.current.receivedAt) / 1000;
      setDisplayRemaining(Math.max(0, serverSnapRef.current.remaining - elapsed));
    }, 100);
    return () => clearInterval(id);
  }, [timer?.status]);

  useEffect(() => {
    if (!timer) return;
    if (timer.status === 'finished' && !dingFiredRef.current) {
      dingFiredRef.current = true;
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 1.2);
      } catch {}
    }
    if (timer.status !== 'finished') dingFiredRef.current = false;
  }, [timer?.status]);

  if (!timer || timer.status === 'idle' || timer.totalSeconds === 0) return null;

  const secs = Math.max(0, Math.ceil(displayRemaining));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  const display = `${m}:${String(s).padStart(2, '0')}`;
  const pct = timer.totalSeconds > 0 ? (displayRemaining / timer.totalSeconds) * 100 : 0;
  const isLow = displayRemaining <= 60 && timer.status === 'running';
  const isDone = timer.status === 'finished';

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-5 py-4 w-full">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Time remaining</p>
      <p className={`text-4xl font-mono font-bold mb-3 ${isDone ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-gray-900'}`}>
        {isDone ? "0:00" : display}
      </p>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isDone ? 'bg-red-400' : isLow ? 'bg-amber-400' : 'bg-green-500'}`}
          style={{ width: `${Math.max(0, pct)}%` }}
        />
      </div>
      {isDone && <p className="text-xs text-red-400 mt-2 text-center font-medium">Time's up!</p>}
    </div>
  );
}

function TwoWayConversationInSession({
  configId,
  sessionId,
  config,
}: {
  configId: number;
  sessionId: string;
  config: AdminConfig;
}) {
  const [showNamesModal, setShowNamesModal] = useState(true);
  const [participant1Name, setParticipant1Name] = useState('');
  const [participant2Name, setParticipant2Name] = useState('');
  const [autoStart, setAutoStart] = useState(false);
  const [transcript, setTranscript] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any>(null);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const { toast } = useToast();

  const handleNameSubmit = (names: { participant1Name: string; participant2Name: string }) => {
    setParticipant1Name(names.participant1Name);
    setParticipant2Name(names.participant2Name);
    setShowNamesModal(false);
    setAutoStart(true);
  };

  const generateFeedback = async () => {
    if (transcript.length === 0) return;
    setIsGeneratingFeedback(true);
    try {
      const res = await fetch(`/api/dual-conversation/feedback?configId=${configId}&sessionId=${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, participant1Name, participant2Name }),
      });
      if (!res.ok) throw new Error('Failed to generate feedback');
      setFeedback(await res.json());
      setShowFeedbackModal(true);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setIsGeneratingFeedback(false);
    }
  };

  return (
    <div className="flex flex-col h-full p-6 gap-4 overflow-y-auto">
      {/* Title + instructions header */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 space-y-2">
        <h2 className="text-base font-semibold text-gray-800 text-center">{config.title}</h2>
        {config.userInstructions && (
          <p className="text-sm text-gray-600 whitespace-pre-line">{config.userInstructions}</p>
        )}
      </div>

      <ParticipantsNameModal
        open={showNamesModal}
        onSubmit={handleNameSubmit}
        participant1Role={config.participant1Role ?? undefined}
        participant2Role={config.participant2Role ?? undefined}
      />
      <FeedbackModal
        open={showFeedbackModal}
        onOpenChange={setShowFeedbackModal}
        feedback={feedback}
        transcript={transcript}
      />
      <DualConversationRecorder
        configId={configId}
        sessionId={sessionId}
        participant1Name={participant1Name}
        participant2Name={participant2Name}
        onTranscriptReady={setTranscript}
        autoStart={autoStart}
      />
      {transcript.length > 0 && (
        <Button
          onClick={feedback ? () => setShowFeedbackModal(true) : generateFeedback}
          disabled={isGeneratingFeedback}
          className="w-full"
        >
          {isGeneratingFeedback ? 'Generating Feedback...' : feedback ? 'View Feedback' : 'Generate Feedback'}
        </Button>
      )}
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <div className="flex items-center gap-2 text-red-600 text-sm">
        <AlertCircle className="h-4 w-4" />
        <span>{message}</span>
      </div>
    </div>
  );
}
