import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

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
  feedbackCriteria: text("feedback_criteria").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertChatConfigSchema = createInsertSchema(chatConfigs);
export const selectChatConfigSchema = createSelectSchema(chatConfigs);

export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;
export type InsertChatConfig = typeof chatConfigs.$inferInsert;
export type SelectChatConfig = typeof chatConfigs.$inferSelect;
