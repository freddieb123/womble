import { pgTable, text, serial, integer, boolean, timestamp, jsonb, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").unique().notNull(),
  password: text("password").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatConfigs = pgTable("chat_configs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  type: text("type", { enum: ['chat', 'upload', 'quiz'] }).default('chat').notNull(),
  title: text("title").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  userInstructions: text("user_instructions"),
  feedbackCriteria: text("feedback_criteria"),
  quizQuestions: jsonb("quiz_questions").$type<QuizQuestion[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deleted: boolean("deleted").default(false).notNull(),
  deletedAt: timestamp("deleted_at"),
  isTemplate: boolean("is_template").default(false).notNull(),
  templateDescription: text("template_description"),
});

export const quizResponses = pgTable("quiz_responses", {
  id: serial("id").primaryKey(),
  configId: integer("config_id").notNull().references(() => chatConfigs.id),
  userId: integer("user_id").references(() => users.id),
  userName: text("user_name"),
  answers: jsonb("answers").$type<QuizAnswer[]>().notNull(),
  score: integer("score").notNull(),
  feedback: jsonb("feedback").$type<QuizFeedback>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Rest of the existing tables...
export const conversations = pgTable("conversations", {
  configId: integer("config_id").notNull().references(() => chatConfigs.id),
  sessionId: text("session_id").notNull(),
  userName: text("user_name"),
  messages: jsonb("messages").$type<Message[]>().notNull().default([]),
  feedback: jsonb("feedback").$type<ConversationFeedback>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.configId, table.sessionId] })
}));

export const uploads = pgTable("uploads", {
  configId: integer("config_id").notNull().references(() => chatConfigs.id),
  sessionId: text("session_id").notNull(),
  userName: text("user_name"),
  fileName: text("file_name").notNull(),
  feedback: jsonb("feedback").$type<UploadFeedback>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.configId, table.sessionId] })
}));

// New Types for Quiz functionality
export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
}

export interface QuizAnswer {
  questionId: string;
  selectedAnswer: string;
  isCorrect: boolean;
  grade: 'correct' | 'wrong' | 'almost';
}

export interface QuizFeedback {
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  almostCorrect: number;
  wrongAnswers: number;
  feedback: string;
}

// Existing types...
export interface Message {
  role: 'user' | 'assistant';
  content: string | {
    text: string;
    image?: string | null;
  };
  timestamp: number;
  id: string;
  sessionId: string;
}

export interface ConversationFeedback {
  bullets: string[];
  score: number;
  summary: string | null;
}

export interface UploadFeedback {
  bullets: string[];
  score: number;
  summary: string | null;
}

// Relations
export const userRelations = relations(users, ({ many }) => ({
  chatConfigs: many(chatConfigs),
  quizResponses: many(quizResponses),
}));

export const chatConfigsRelations = relations(chatConfigs, ({ one, many }) => ({
  user: one(users, {
    fields: [chatConfigs.userId],
    references: [users.id],
  }),
  conversations: many(conversations),
  uploads: many(uploads),
  quizResponses: many(quizResponses),
}));

// Existing relations...
export const conversationsRelations = relations(conversations, ({ one }) => ({
  config: one(chatConfigs, {
    fields: [conversations.configId],
    references: [chatConfigs.id],
  }),
}));

export const uploadsRelations = relations(uploads, ({ one }) => ({
  config: one(chatConfigs, {
    fields: [uploads.configId],
    references: [chatConfigs.id],
  }),
}));

export const quizResponsesRelations = relations(quizResponses, ({ one }) => ({
  config: one(chatConfigs, {
    fields: [quizResponses.configId],
    references: [chatConfigs.id],
  }),
  user: one(users, {
    fields: [quizResponses.userId],
    references: [users.id],
  }),
}));

// Schemas
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertChatConfigSchema = createInsertSchema(chatConfigs);
export const selectChatConfigSchema = createSelectSchema(chatConfigs);
export const insertConversationSchema = createInsertSchema(conversations);
export const selectConversationSchema = createSelectSchema(conversations);
export const insertUploadSchema = createInsertSchema(uploads);
export const selectUploadSchema = createSelectSchema(uploads);
export const insertQuizResponseSchema = createInsertSchema(quizResponses);
export const selectQuizResponseSchema = createSelectSchema(quizResponses);

// Types
export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;
export type InsertChatConfig = typeof chatConfigs.$inferInsert;
export type SelectChatConfig = typeof chatConfigs.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
export type SelectConversation = typeof conversations.$inferSelect;
export type InsertUpload = typeof uploads.$inferInsert;
export type SelectUpload = typeof uploads.$inferSelect;
export type InsertQuizResponse = typeof quizResponses.$inferInsert;
export type SelectQuizResponse = typeof quizResponses.$inferSelect;