import { pgTable, text, serial, integer, boolean, timestamp, jsonb, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  email: text("email"),
  password: text("password"),
  firebaseUid: text("firebase_uid").unique(),
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
});

// Relations
export const userRelations = relations(users, ({ many }) => ({
  chatConfigs: many(chatConfigs),
}));

export const chatConfigsRelations = relations(chatConfigs, ({ one }) => ({
  user: one(users, {
    fields: [chatConfigs.userId],
    references: [users.id],
  }),
}));

// Schemas
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertChatConfigSchema = createInsertSchema(chatConfigs);
export const selectChatConfigSchema = createSelectSchema(chatConfigs);

// Types
export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;
export type InsertChatConfig = typeof chatConfigs.$inferInsert;
export type SelectChatConfig = typeof chatConfigs.$inferSelect;