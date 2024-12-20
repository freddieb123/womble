import { pgTable, text, serial, integer, boolean, timestamp, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
});

export const chatGPTs = pgTable("chat_gpts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  userInstructions: text("user_instructions"),
  feedbackCriteria: text("feedback_criteria"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deleted: boolean("deleted").default(false).notNull(),
  deletedAt: timestamp("deleted_at"),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  gptId: integer("gpt_id").notNull().references(() => chatGPTs.id),
  sessionId: text("session_id").notNull(),
  userName: text("user_name"),
  messages: jsonb("messages").notNull().default('[]'),
  feedback: jsonb("feedback").default('{}'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    gptSessionIdx: unique("gpt_session_idx").on(table.gptId, table.sessionId),
  };
});

// Relations
export const chatGPTsRelations = relations(chatGPTs, ({ many }) => ({
  conversations: many(conversations),
}));

export const conversationsRelations = relations(conversations, ({ one }) => ({
  gpt: one(chatGPTs, {
    fields: [conversations.gptId],
    references: [chatGPTs.id],
  }),
}));

// Schemas
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertGPTSchema = createInsertSchema(chatGPTs);
export const selectGPTSchema = createSelectSchema(chatGPTs);
export const insertConversationSchema = createInsertSchema(conversations);
export const selectConversationSchema = createSelectSchema(conversations);

// Types
export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;
export type InsertGPT = typeof chatGPTs.$inferInsert;
export type SelectGPT = typeof chatGPTs.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
export type SelectConversation = typeof conversations.$inferSelect;