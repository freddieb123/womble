import { useState } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import ChatInterface from "@/components/ChatInterface";
import VoiceChatInterface from "@/components/VoiceChatInterface";
import UploadInterface from "@/components/UploadInterface";
import QuizInterface from "@/components/QuizInterface";
import WombleHeader from "@/components/WombleHeader";
import WombleFooter from "@/components/WombleFooter";
import { ParticipantCount, LiveLeaderboard } from "@/components/LiveActivityPanel";
import { AdminConfig } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { SelectChatConfig } from "@db/schema";

export default function UserView() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const configId = searchParams.get('configId');
  const sessionId = searchParams.get('sessionId') || crypto.randomUUID();
  const [userName, setUserName] = useState<string | null>(searchParams.get('userName'));
  const [chatMode, setChatMode] = useState<'typed' | 'spoken' | null>(searchParams.get('mode') as 'typed' | 'spoken' | null);
  const isViewOnly = searchParams.get('viewOnly') === 'true';

  const { data: savedConfig, isLoading, error } = useQuery<SelectChatConfig & { questions?: Array<{ question: string; expectedAnswer: string }> }>({
    queryKey: [`/api/chat-configs/${configId}`],
    enabled: !!configId,
    retry: 1,
    staleTime: Infinity,
  });

  const updateUrlWithUserName = (name: string, mode?: 'typed' | 'spoken') => {
    const newParams = new URLSearchParams(window.location.search);
    newParams.set('userName', name);
    if (mode) newParams.set('mode', mode);
    if (!newParams.has('sessionId')) newParams.set('sessionId', sessionId);
    if (!newParams.has('configId') && configId) newParams.set('configId', configId);
    const newUrl = `${window.location.pathname}?${newParams.toString()}`;
    window.history.replaceState({}, '', newUrl);
    setUserName(name);
    if (mode) setChatMode(mode);
    return newUrl;
  };

  if (!configId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="p-6">
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <p className="text-sm text-red-700">Config ID is required</p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="p-6">
            <div className="flex items-center justify-center h-[600px]">
              <div className="animate-pulse text-blue-900">Loading configuration...</div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (error || !savedConfig) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="p-6">
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <p className="text-sm text-red-700">
                Failed to load configuration: {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  console.log('Saved config:', savedConfig);

  const config: AdminConfig = {
    id: savedConfig.id,
    type: savedConfig.type || 'chat',
    title: savedConfig.title,
    systemPrompt: savedConfig.systemPrompt,
    temperature: 0.7,
    maxTokens: 1000,
    userInstructions: savedConfig.userInstructions || "",
    feedbackCriteria: savedConfig.feedbackCriteria || "",
    questions: savedConfig.questions || [],
    knowledgeLevel: (savedConfig as any).knowledgeLevel ?? undefined,
    attitude: (savedConfig as any).attitude ?? undefined,
    coachingStyle: (savedConfig as any).coachingStyle ?? undefined,
    referenceImages: (savedConfig as any).referenceImages ?? undefined,
    referenceContent: (savedConfig as any).referenceContent ?? undefined,
  };

  console.log('Transformed config:', config);

  // Redirect to the dual conversation page if the type is 'two-way-conversation'
  if (config.type === 'two-way-conversation') {
    // Redirect to DualConversationPage
    window.location.href = `/dual-conversation/${configId}?sessionId=${sessionId}${userName ? `&userName=${encodeURIComponent(userName)}` : ''}`;
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="p-6">
            <div className="flex items-center justify-center h-[600px]">
              <div className="animate-pulse text-blue-900">Redirecting to conversation recording interface...</div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const showLivePanels = (config.type === 'chat' || config.type === 'teach-ai') && !isViewOnly;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col">
      <WombleHeader />
      <div className="flex-1 p-4 md:p-8">
        {showLivePanels ? (
          <div className="flex gap-4 max-w-6xl mx-auto items-start">
            <div className="hidden lg:block w-40 flex-shrink-0 pt-2">
              <ParticipantCount configId={config.id!} />
            </div>
            <div className="flex-1 min-w-0">
              <Card className="p-6">
                {chatMode === 'spoken' ? (
                  <VoiceChatInterface
                    config={config}
                    sessionId={sessionId}
                    userName={userName}
                    onUserNameSubmit={updateUrlWithUserName}
                  />
                ) : (
                  <ChatInterface
                    config={config}
                    sessionId={sessionId}
                    userName={userName}
                    isViewOnly={isViewOnly}
                    onUserNameSubmit={updateUrlWithUserName}
                  />
                )}
              </Card>
            </div>
            <div className="hidden lg:block w-40 flex-shrink-0 pt-2">
              <LiveLeaderboard configId={config.id!} />
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            <Card className="p-6">
              {config.type === 'upload' ? (
                <UploadInterface
                  config={config}
                  sessionId={sessionId}
                  userName={userName}
                  onUserNameSubmit={updateUrlWithUserName}
                />
              ) : config.type === 'quiz' ? (
                <QuizInterface
                  config={config}
                  sessionId={sessionId}
                  userName={userName}
                  onUserNameSubmit={updateUrlWithUserName}
                  isViewOnly={isViewOnly}
                />
              ) : chatMode === 'spoken' ? (
                <VoiceChatInterface
                  config={config}
                  sessionId={sessionId}
                  userName={userName}
                  onUserNameSubmit={updateUrlWithUserName}
                />
              ) : (
                <ChatInterface
                  config={config}
                  sessionId={sessionId}
                  userName={userName}
                  isViewOnly={isViewOnly}
                  onUserNameSubmit={updateUrlWithUserName}
                />
              )}
            </Card>
          </div>
        )}
      </div>
      <WombleFooter />
    </div>
  );
}