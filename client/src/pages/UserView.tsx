import { useState } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import ChatInterface from "@/components/ChatInterface";
import VoiceChatInterface from "@/components/VoiceChatInterface";
import UploadInterface from "@/components/UploadInterface";
import QuizInterface from "@/components/QuizInterface";
import GroupBoardInterface from "@/components/GroupBoardInterface";
import UserTesterInterface from "@/components/UserTesterInterface";
import DocCritiqueInterface from "@/components/DocCritiqueInterface";
import TaskWalkthroughInterface from "@/components/TaskWalkthroughInterface";
import WombleHeader from "@/components/WombleHeader";
import WombleFooter from "@/components/WombleFooter";
import { ParticipantCount, LiveLeaderboard, UserTimerDisplay } from "@/components/LiveActivityPanel";
import { AdminConfig } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Keyboard, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectChatConfig } from "@db/schema";

export default function UserView() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const configId = searchParams.get('configId');
  const sessionId = searchParams.get('sessionId') || crypto.randomUUID();
  const [userName, setUserName] = useState<string | null>(searchParams.get('userName'));
  const [chatMode, setChatMode] = useState<'typed' | 'spoken' | null>(searchParams.get('mode') as 'typed' | 'spoken' | null);
  const [currentAttempt, setCurrentAttempt] = useState(1);
  const isViewOnly = searchParams.get('viewOnly') === 'true';

  const { data: savedConfig, isLoading, error } = useQuery<SelectChatConfig & { questions?: Array<{ question: string; expectedAnswer: string }> }>({
    queryKey: [`/api/chat-configs/${configId}`],
    enabled: !!configId,
    retry: 1,
    staleTime: Infinity,
  });

  const handleTryAgain = (interactionMode: 'typed' | 'spoken' | 'both') => {
    setCurrentAttempt(prev => prev + 1);
    if (interactionMode === 'both') {
      setChatMode(null); // triggers mode picker
    }
    // single-mode activities: chatMode stays as-is, key change remounts the component
  };

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
      <div className="min-h-screen bg-gray-50 p-4 md:p-8">
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
      <div className="min-h-screen bg-gray-50 p-4 md:p-8">
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
      <div className="min-h-screen bg-gray-50 p-4 md:p-8">
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
    interactionMode: ((savedConfig as any).interactionMode ?? 'both') as 'typed' | 'spoken' | 'both',
    groupBoardSettings: (savedConfig as any).groupBoardSettings ?? undefined,
  };

  console.log('Transformed config:', config);

  // Redirect to the dual conversation page if the type is 'two-way-conversation'
  if (config.type === 'two-way-conversation') {
    // Redirect to DualConversationPage
    window.location.href = `/dual-conversation/${configId}?sessionId=${sessionId}${userName ? `&userName=${encodeURIComponent(userName)}` : ''}`;
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-8">
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

  if (config.type === 'user-tester') {
    return (
      <div className="h-screen flex flex-col overflow-hidden">
        <WombleHeader />
        <div className="flex-1 overflow-hidden">
          <UserTesterInterface
            config={config}
            sessionId={sessionId}
            userName={userName}
            onUserNameSubmit={updateUrlWithUserName}
          />
        </div>
        <WombleFooter />
      </div>
    );
  }

  if (config.type === 'doc-critique') {
    return (
      <div className="h-screen flex flex-col overflow-hidden">
        <WombleHeader />
        <div className="flex-1 overflow-hidden flex gap-4 px-4 py-3">
          {!isViewOnly && (
            <div className="hidden lg:flex lg:flex-col w-40 flex-shrink-0 pt-1">
              <ParticipantCount configId={config.id!} />
              <UserTimerDisplay configId={config.id!} />
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <DocCritiqueInterface
              config={config}
              sessionId={sessionId}
              userName={userName}
              onUserNameSubmit={updateUrlWithUserName}
            />
          </div>
        </div>
        <WombleFooter />
      </div>
    );
  }

  if (config.type === 'task-walkthrough') {
    return (
      <div className="h-screen flex flex-col overflow-hidden">
        <WombleHeader />
        <div className="flex-1 overflow-hidden">
          <TaskWalkthroughInterface
            config={config}
            sessionId={sessionId}
            userName={userName}
            onUserNameSubmit={updateUrlWithUserName}
          />
        </div>
        <WombleFooter />
      </div>
    );
  }

  if (config.type === 'group-board') {
    return (
      <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
        <WombleHeader />
        <div className="flex-1 overflow-hidden px-4 py-3">
          <div className="max-w-6xl mx-auto h-full">
            <div className="h-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <GroupBoardInterface
                config={config}
                userName={userName}
                onUserNameSubmit={updateUrlWithUserName}
              />
            </div>
          </div>
        </div>
        <WombleFooter />
      </div>
    );
  }

  // Left panel: participant count
  const showParticipantCount = !isViewOnly && ['chat', 'teach-ai', 'thought-partner', 'quiz'].includes(config.type);
  // Right panel: live leaderboard (only for graded activities)
  const showLeaderboard = !isViewOnly && ['chat', 'teach-ai'].includes(config.type);
  // Show side panels layout if either panel is active
  const showSidePanels = showParticipantCount || showLeaderboard;

  // Mode picker shown when trying again on a 'both' activity
  const modePicker = (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <p className="text-base font-medium text-gray-700">How would you like to practise?</p>
      <div className="flex gap-4">
        <Button size="lg" variant="outline" className="px-8" onClick={() => setChatMode('typed')}>
          <Keyboard className="h-5 w-5 mr-2" /> Typed
        </Button>
        <Button size="lg" variant="outline" className="px-8" onClick={() => setChatMode('spoken')}>
          <Mic className="h-5 w-5 mr-2" /> Voice
        </Button>
      </div>
    </div>
  );

  const renderChatOrVoice = () => {
    if (chatMode === null && currentAttempt > 1 && config.interactionMode === 'both') {
      return modePicker;
    }
    if (chatMode === 'spoken') {
      return (
        <VoiceChatInterface
          key={currentAttempt}
          config={config}
          sessionId={sessionId}
          userName={userName}
          attemptNumber={currentAttempt}
          onUserNameSubmit={updateUrlWithUserName}
          onTryAgain={() => handleTryAgain(config.interactionMode ?? 'both')}
        />
      );
    }
    return (
      <ChatInterface
        key={currentAttempt}
        config={config}
        sessionId={sessionId}
        userName={userName}
        isViewOnly={isViewOnly}
        attemptNumber={currentAttempt}
        onUserNameSubmit={updateUrlWithUserName}
        onTryAgain={() => handleTryAgain(config.interactionMode ?? 'both')}
      />
    );
  };

  const renderMainContent = () => {
    if (config.type === 'upload') return <UploadInterface config={config} sessionId={sessionId} userName={userName} onUserNameSubmit={updateUrlWithUserName} />;
    if (config.type === 'quiz') return <QuizInterface config={config} sessionId={sessionId} userName={userName} onUserNameSubmit={updateUrlWithUserName} isViewOnly={isViewOnly} />;
    return renderChatOrVoice();
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <WombleHeader />
      <div className="flex-1 overflow-hidden px-4 py-3 md:px-6">
        {showSidePanels ? (
          <div className="flex gap-4 max-w-6xl mx-auto h-full items-stretch">
            {/* Left: participant count */}
            <div className="hidden lg:flex lg:flex-col w-40 flex-shrink-0 pt-1">
              {showParticipantCount && <ParticipantCount configId={config.id!} />}
            </div>
            {/* Centre: main activity */}
            <div className="flex-1 min-w-0 flex flex-col">
              <Card className="flex-1 flex flex-col overflow-hidden p-4">
                {renderMainContent()}
              </Card>
            </div>
            {/* Right: leaderboard + timer */}
            <div className="hidden lg:flex lg:flex-col w-40 flex-shrink-0 pt-1 gap-3">
              {showLeaderboard && <LiveLeaderboard configId={config.id!} />}
              <UserTimerDisplay configId={config.id!} />
            </div>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto h-full flex flex-col">
            <Card className="flex-1 flex flex-col overflow-hidden p-4">
              {renderMainContent()}
            </Card>
          </div>
        )}
      </div>
      <WombleFooter />
    </div>
  );
}