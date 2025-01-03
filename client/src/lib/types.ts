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
  systemPrompt: string;
  userInstructions: string;
  feedbackCriteria: string;
  temperature: number;
  maxTokens: number;
}