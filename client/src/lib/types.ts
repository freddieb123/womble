export interface MessageContent {
  text: string;
  image: string | null;
}

export interface Message {
  id: string;
  content: string | MessageContent;
  role: 'user' | 'assistant';
  timestamp: number;
  sessionId: string;
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}

export interface AdminConfig {
  id?: number;
  title: string;
  type: 'chat' | 'upload';
  systemPrompt: string;
  userInstructions: string;
  feedbackCriteria: string;
  temperature: number;
  maxTokens: number;
}

export interface UploadState {
  file: string | null;
  isLoading: boolean;
  error: string | null;
  feedback?: {
    bullets: string[];
    score: number;
    summary: string | null;
  } | null;  // Make feedback entirely optional and nullable
}