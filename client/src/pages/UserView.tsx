import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import ChatInterface from "@/components/ChatInterface";
import UploadInterface from "@/components/UploadInterface";
import QuizInterface from "@/components/QuizInterface";
import { AdminConfig } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { SelectChatConfig } from "@db/schema";

export default function UserView() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const configId = searchParams.get('configId');
  const sessionId = searchParams.get('sessionId') || crypto.randomUUID();
  const userName = searchParams.get('userName');
  const isViewOnly = searchParams.get('viewOnly') === 'true';

  const { data: savedConfig, isLoading, error } = useQuery<SelectChatConfig>({
    queryKey: [`/api/chat-configs/${configId}`],
    enabled: !!configId,
    retry: 1,
    staleTime: Infinity,
  });

  const updateUrlWithUserName = (name: string) => {
    const newParams = new URLSearchParams(window.location.search);
    newParams.set('userName', name);
    if (!newParams.has('sessionId')) {
      newParams.set('sessionId', sessionId);
    }
    if (!newParams.has('configId') && configId) {
      newParams.set('configId', configId);
    }
    const newUrl = `${window.location.pathname}?${newParams.toString()}`;
    window.history.replaceState({}, '', newUrl);
    window.location.reload();
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

  const config: AdminConfig = {
    id: savedConfig.id,
    type: savedConfig.type || 'chat',
    title: savedConfig.title,
    systemPrompt: savedConfig.systemPrompt,
    temperature: 0.7,
    maxTokens: 1000,
    userInstructions: savedConfig.userInstructions || "",
    feedbackCriteria: savedConfig.feedbackCriteria || "",
    quizQuestions: savedConfig.quizQuestions || []
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
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
    </div>
  );
}