import { pgTable, text, serial, integer, boolean, timestamp, jsonb, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
});

export const chatConfigs = pgTable("chat_configs", {
  id: serial("id").primaryKey(),
  type: text("type", { enum: ['chat', 'upload'] }).default('chat').notNull(),
  title: text("title").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  userInstructions: text("user_instructions"),
  feedbackCriteria: text("feedback_criteria"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deleted: boolean("deleted").default(false).notNull(),
  deletedAt: timestamp("deleted_at"),
});

// Combined table for both conversations and uploads
export const messages = pgTable("messages", {
  configId: integer("config_id").notNull().references(() => chatConfigs.id),
  sessionId: text("session_id").notNull(),
  type: text("type", { enum: ['conversation', 'upload'] }).notNull(),
  userName: text("user_name"),
  // For conversations
  messages: jsonb("messages").$type<Message[]>().default([]),
  // For uploads
  fileName: text("file_name"),
  feedback: jsonb("feedback").$type<FeedbackData>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.configId, table.sessionId] })
}));

// Types for JSON columns
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

export interface FeedbackData {
  bullets: string[];
  score: number;  
  summary: string | null;
}

// Relations
export const chatConfigsRelations = relations(chatConfigs, ({ many }) => ({
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  config: one(chatConfigs, {
    fields: [messages.configId],
    references: [chatConfigs.id],
  }),
}));

// Schemas
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertChatConfigSchema = createInsertSchema(chatConfigs);
export const selectChatConfigSchema = createSelectSchema(chatConfigs);
export const insertMessageSchema = createInsertSchema(messages);
export const selectMessageSchema = createSelectSchema(messages);

// Types
export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;
export type InsertChatConfig = typeof chatConfigs.$inferInsert;
export type SelectChatConfig = typeof chatConfigs.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;
export type SelectMessage = typeof messages.$inferSelect;