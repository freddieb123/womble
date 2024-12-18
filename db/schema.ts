import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
});

export const chatConfigs = pgTable("chat_configs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  userInstructions: text("user_instructions"),
  feedbackCriteria: text("feedback_criteria").default("").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  configId: integer("config_id").notNull().references(() => chatConfigs.id),
  sessionId: text("session_id").notNull(),
  messages: jsonb("messages").notNull().default('[]'),
  feedback: jsonb("feedback").default('{}'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const chatConfigsRelations = relations(chatConfigs, ({ many }) => ({
  conversations: many(conversations),
}));

export const conversationsRelations = relations(conversations, ({ one }) => ({
  config: one(chatConfigs, {
    fields: [conversations.configId],
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

// Types
export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;
export type InsertChatConfig = typeof chatConfigs.$inferInsert;
export type SelectChatConfig = typeof chatConfigs.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
export type SelectConversation = typeof conversations.$inferSelect;
