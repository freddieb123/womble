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
  howToAssess: string;
}

// Base configuration type
export interface BaseConfig {
  id?: number;
  title: string;
  type: 'chat' | 'upload' | 'quiz';
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
export interface Template extends AdminConfig {
  usageCount?: number;
  id: number;
  isTemplate: boolean;
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
// Add or update the Template interface
export interface Template {
  id: number;
  title: string;
  type: 'chat' | 'upload' | 'quiz';
  systemPrompt: string;
  userInstructions?: string | null;
  feedbackCriteria?: string | null;
  createdAt: string;
  isTemplate: boolean;
  templateDescription?: string | null;
  conversationCount?: number;
  questions?: Array<{
    question: string;
    expectedAnswer: string;
  }>;
  creator?: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}
