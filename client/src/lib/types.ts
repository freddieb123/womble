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

export interface QuizQuestion {
  question: string;
  expectedAnswer: string;
}

export interface AdminConfig {
  id?: number;
  title: string;
  type: 'chat' | 'upload' | 'quiz';
  systemPrompt: string;
  userInstructions: string;
  feedbackCriteria: string;
  temperature: number;
  maxTokens: number;
  templateDescription?: string;
  questions?: QuizQuestion[];
}

export interface Feedback {
  bullets: string[];
  score: number;
  summary: string | null;
  rawFeedback?: string;
}

export interface UploadState {
  file: string | null;
  isLoading: boolean;
  error: string | null;
  feedback: Feedback | null;
}

export interface QuizFeedback {
  status: 'correct' | 'almost' | 'incorrect';
  feedback: string;
}