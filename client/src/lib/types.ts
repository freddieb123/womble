export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}

export interface AdminConfig {
  title: string;
  systemPrompt: string;
  userInstructions: string;
  temperature: number;
  maxTokens: number;
}
