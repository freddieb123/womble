export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
  sessionId: string;  // Added sessionId to the Message interface
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