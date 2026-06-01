import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import ChatInterface from "@/components/ChatInterface";
import QuizInterface from "@/components/QuizInterface";
import QuickFireQuizInterface from "@/components/QuickFireQuizInterface";
import UploadInterface from "@/components/UploadInterface";
import UserTesterInterface from "@/components/UserTesterInterface";
import type { AdminConfig } from "@/lib/types";
import type { SelectChatConfig } from "@db/schema";

interface Props {
  configId: number;
  configType: string;
  userName: string | null;
  onUserNameChange: (name: string) => void;
}

export default function ActivityFrame({ configId, configType, userName, onUserNameChange }: Props) {
  const sessionId = useRef(crypto.randomUUID()).current;
  const [chatMode] = useState<'typed' | 'spoken'>('typed');

  const { data: savedConfig, isLoading } = useQuery<SelectChatConfig & { questions?: Array<{ question: string; expectedAnswer: string }> }>({
    queryKey: [`/api/chat-configs/${configId}`],
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-blue-900">Loading activity...</div>
      </div>
    );
  }

  if (!savedConfig) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Activity not found
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
    questions: savedConfig.questions || [],
    knowledgeLevel: (savedConfig as any).knowledgeLevel ?? undefined,
    attitude: (savedConfig as any).attitude ?? undefined,
    coachingStyle: (savedConfig as any).coachingStyle ?? undefined,
    referenceImages: (savedConfig as any).referenceImages ?? undefined,
    referenceContent: (savedConfig as any).referenceContent ?? undefined,
    interactionMode: ((savedConfig as any).interactionMode ?? 'both') as 'typed' | 'spoken' | 'both',
    groupBoardSettings: (savedConfig as any).groupBoardSettings ?? undefined,
  };

  const handleNameSubmit = (name: string) => {
    onUserNameChange(name);
    return `?configId=${configId}&userName=${encodeURIComponent(name)}`;
  };

  if (config.type === 'quiz') {
    return (
      <QuizInterface
        config={config}
        sessionId={sessionId}
        userName={userName}
        onUserNameSubmit={handleNameSubmit}
        isViewOnly={false}
      />
    );
  }

  if (config.type === 'quick-fire-quiz') {
    if (!userName) {
      return (
        <div className="flex items-center justify-center h-full flex-col gap-4">
          <p className="text-gray-600">Enter your name to participate</p>
          <NameInput onSubmit={onUserNameChange} />
        </div>
      );
    }
    return <QuickFireQuizInterface configId={configId} userName={userName} />;
  }

  if (config.type === 'upload') {
    return (
      <UploadInterface
        config={config}
        sessionId={sessionId}
        userName={userName}
        onUserNameSubmit={handleNameSubmit}
      />
    );
  }

  if (config.type === 'user-tester') {
    return (
      <UserTesterInterface
        config={config}
        sessionId={sessionId}
        userName={userName}
        onUserNameSubmit={handleNameSubmit}
      />
    );
  }

  return (
    <ChatInterface
      config={config}
      sessionId={sessionId}
      userName={userName}
      isViewOnly={false}
      onUserNameSubmit={handleNameSubmit}
    />
  );
}

function NameInput({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && value.trim()) onSubmit(value.trim()); }}
        placeholder="Your name"
        className="border rounded px-3 py-2 text-sm"
        autoFocus
      />
      <button
        onClick={() => { if (value.trim()) onSubmit(value.trim()); }}
        className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
      >
        Join
      </button>
    </div>
  );
}
