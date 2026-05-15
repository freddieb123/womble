import { useState } from "react";
import { Card } from "@/components/ui/card";
import ChatInterface from "@/components/ChatInterface";
import VoiceChatInterface from "@/components/VoiceChatInterface";
import { AdminConfig } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { SelectChatConfig } from "@db/schema";

export default function MiroPanel() {
  const searchParams = new URLSearchParams(window.location.search);
  const configId = searchParams.get('configId');
  const sessionId = searchParams.get('sessionId') || crypto.randomUUID();
  const [userName, setUserName] = useState<string | null>(searchParams.get('userName'));
  const [chatMode, setChatMode] = useState<'typed' | 'spoken' | null>(
    searchParams.get('mode') as 'typed' | 'spoken' | null
  );

  const { data: savedConfig, isLoading, error } = useQuery<
    SelectChatConfig & { questions?: Array<{ question: string; expectedAnswer: string }> }
  >({
    queryKey: [`/api/chat-configs/${configId}`],
    enabled: !!configId,
    retry: 1,
    staleTime: Infinity,
  });

  const updateUrl = (name: string, mode?: 'typed' | 'spoken') => {
    const newParams = new URLSearchParams(window.location.search);
    newParams.set('userName', name);
    if (mode) newParams.set('mode', mode);
    if (!newParams.has('sessionId')) newParams.set('sessionId', sessionId);
    if (!newParams.has('configId') && configId) newParams.set('configId', configId);
    window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`);
    setUserName(name);
    if (mode) setChatMode(mode);
    return `${window.location.pathname}?${newParams.toString()}`;
  };

  if (!configId || error || (!isLoading && !savedConfig)) {
    return (
      <div className="h-screen bg-white flex items-center justify-center p-4">
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{!configId ? 'No activity specified.' : 'Failed to load activity.'}</span>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-screen bg-white flex items-center justify-center">
        <div className="animate-pulse text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  const config: AdminConfig = {
    id: savedConfig!.id,
    type: savedConfig!.type || 'chat',
    title: savedConfig!.title,
    systemPrompt: savedConfig!.systemPrompt,
    temperature: 0.7,
    maxTokens: 1000,
    userInstructions: savedConfig!.userInstructions || "",
    feedbackCriteria: savedConfig!.feedbackCriteria || "",
    questions: (savedConfig as any).questions || [],
    knowledgeLevel: (savedConfig as any).knowledgeLevel ?? undefined,
    attitude: (savedConfig as any).attitude ?? undefined,
    coachingStyle: (savedConfig as any).coachingStyle ?? undefined,
    referenceImages: (savedConfig as any).referenceImages ?? undefined,
    referenceContent: (savedConfig as any).referenceContent ?? undefined,
    interactionMode: ((savedConfig as any).interactionMode ?? 'both') as 'typed' | 'spoken' | 'both',
  };

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      {/* Minimal Womble branding strip */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-100 flex-shrink-0">
        <img src="/womble-icon.svg" alt="Womble" className="h-5 w-5" />
        <span className="text-sm font-semibold text-green-700">Womble</span>
        <span className="text-gray-300 mx-1">·</span>
        <span className="text-xs text-gray-500 truncate">{config.title}</span>
      </div>

      {/* Activity */}
      <div className="flex-1 overflow-hidden p-3">
        <Card className="h-full flex flex-col overflow-hidden p-3">
          {chatMode === 'spoken' ? (
            <VoiceChatInterface
              config={config}
              sessionId={sessionId}
              userName={userName}
              onUserNameSubmit={updateUrl}
            />
          ) : (
            <ChatInterface
              config={config}
              sessionId={sessionId}
              userName={userName}
              isViewOnly={false}
              onUserNameSubmit={updateUrl}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
