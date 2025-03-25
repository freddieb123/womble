// Message related types
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

// Base configuration type
export interface BaseConfig {
  id?: number;
  title: string;
  type: 'chat' | 'upload' | 'quiz' | 'two-way-conversation';
  systemPrompt: string;
  userInstructions: string | null;
  feedbackCriteria: string | null;
  temperature?: number;
  maxTokens?: number;
}

// Admin specific configuration
export interface AdminConfig extends BaseConfig {
  questions?: QuizQuestion[];
  isTemplate?: boolean;
  templateDescription?: string;
  deleted?: boolean;
  deletedAt?: string | null;
  conversationCount?: number;
}

// Template specific configuration
export interface Template extends Omit<AdminConfig, 'templateDescription'> {
  usageCount?: number;
  id: number;
  isTemplate: boolean;
  templateDescription?: string | null;
}

// Badge variant types
export type BadgeVariant = 'default' | 'secondary' | 'outline' | 'custom-green' | 'custom-purple' | 'custom-blue';

// Feedback related types
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
// NOTE: Template interface is already defined above
