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
  userId: integer("user_id").notNull().references(() => users.id),
  type: text("type", { enum: ['chat', 'upload'] }).default('chat').notNull(),
  title: text("title").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  userInstructions: text("user_instructions"),
  feedbackCriteria: text("feedback_criteria"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deleted: boolean("deleted").default(false).notNull(),
  deletedAt: timestamp("deleted_at"),
  isTemplate: boolean("is_template").default(false).notNull(),
});

// Conversations table - for chat messages
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

// Separate uploads table for file uploads
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
}));

export const chatConfigsRelations = relations(chatConfigs, ({ one, many }) => ({
  user: one(users, {
    fields: [chatConfigs.userId],
    references: [users.id],
  }),
  conversations: many(conversations),
  uploads: many(uploads),
}));

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

// Schemas
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertChatConfigSchema = createInsertSchema(chatConfigs);
export const selectChatConfigSchema = createSelectSchema(chatConfigs);
export const insertConversationSchema = createInsertSchema(conversations);
export const selectConversationSchema = createSelectSchema(conversations);
export const insertUploadSchema = createInsertSchema(uploads);
export const selectUploadSchema = createSelectSchema(uploads);

// Types
export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;
export type InsertChatConfig = typeof chatConfigs.$inferInsert;
export type SelectChatConfig = typeof chatConfigs.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
export type SelectConversation = typeof conversations.$inferSelect;
export type InsertUpload = typeof uploads.$inferInsert;
export type SelectUpload = typeof uploads.$inferSelect;