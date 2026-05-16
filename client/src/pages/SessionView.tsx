import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import WombleHeader from "@/components/WombleHeader";
import WombleFooter from "@/components/WombleFooter";
import ChatInterface from "@/components/ChatInterface";
import VoiceChatInterface from "@/components/VoiceChatInterface";
import QuizInterface from "@/components/QuizInterface";
import UploadInterface from "@/components/UploadInterface";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Keyboard, Mic } from "lucide-react";
import type { AdminConfig } from "@/lib/types";

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
  const [nameInput, setNameInput] = useState('');
  const [showNameModal, setShowNameModal] = useState(false);
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [chatModes, setChatModes] = useState<Record<number, 'typed' | 'spoken'>>({});
  const [showModeModal, setShowModeModal] = useState(false);
  const [pendingConfigId, setPendingConfigId] = useState<number | null>(null);

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

  // Show name modal if no name yet
  useEffect(() => {
    if (!userName && sessionData && !showNameModal) {
      setShowNameModal(true);
    }
  }, [userName, sessionData, showNameModal]);

  const handleNameSubmit = () => {
    if (!nameInput.trim()) return;
    const name = nameInput.trim();
    localStorage.setItem(LS_NAME_KEY, name);
    setUserName(name);
    setShowNameModal(false);
  };

  const handleSelectActivity = (config: SessionConfig) => {
    if (!config.isLive) return;
    if (config.interactionMode === 'both' && !chatModes[config.id]) {
      // Need to pick mode
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
        <div className="w-56 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          <div className="px-3 pt-4 pb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Activities</p>
          </div>
          <nav className="flex-1 px-2 pb-4 space-y-1">
            {configs.map((cfg) => {
              const isSelected = cfg.id === selectedConfigId;
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
                    <span className="truncate">{cfg.title}</span>
                  </div>
                </button>
              );
            })}
          </nav>
          {userName && (
            <div className="px-3 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 truncate">{userName}</p>
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-hidden p-4">
          {!selectedConfig ? (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
              Select an activity from the sidebar to get started.
            </div>
          ) : (
            <Card className="h-full flex flex-col overflow-hidden p-4">
              {chatMode === 'spoken' ? (
                <VoiceChatInterface
                  config={adminConfig!}
                  sessionId={getSessionId(selectedConfig.id)}
                  userName={userName}
                  onUserNameSubmit={handleUserNameFromActivity}
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
      </div>

      <WombleFooter />

      {/* Name modal */}
      <Dialog open={showNameModal} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Welcome! What's your name?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              placeholder="Your name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
              autoFocus
            />
            <Button className="w-full bg-green-600 hover:bg-green-700" onClick={handleNameSubmit} disabled={!nameInput.trim()}>
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
