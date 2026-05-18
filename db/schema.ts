import { pgTable, text, serial, integer, boolean, timestamp, jsonb, primaryKey, unique } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").unique().notNull(),
  password: text("password").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginMethod: text("last_login_method"),
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  shareToken: text("share_token").unique().notNull(),
  title: text("title").notNull().default("New Session"),
  isLibrary: boolean("is_library").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const chatConfigs = pgTable("chat_configs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  type: text("type", { enum: ['chat', 'upload', 'quiz', 'two-way-conversation', 'teach-ai', 'thought-partner', 'quick-fire-quiz'] }).default('chat').notNull(),
  title: text("title").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  userInstructions: text("user_instructions"),
  feedbackCriteria: text("feedback_criteria"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deleted: boolean("deleted").default(false).notNull(),
  deletedAt: timestamp("deleted_at"),
  isTemplate: boolean("is_template").default(false).notNull(),
  templateDescription: text("template_description"),
  participant1Role: text("participant1_role"),
  participant2Role: text("participant2_role"),
  knowledgeLevel: integer("knowledge_level"),
  attitude: integer("attitude"),
  coachingStyle: integer("coaching_style"),
  referenceContent: text("reference_content"),
  referenceImages: jsonb("reference_images").$type<string[]>(),
  interactionMode: text("interaction_mode", { enum: ['typed', 'spoken', 'both'] }).default('both'),
  feedbackHarshness: text("feedback_harshness", { enum: ['encouraging', 'developmental', 'standard', 'high-performance', 'elite'] }).default('standard'),
  sessionId: integer("session_id").references(() => sessions.id),
  sessionOrder: integer("session_order"),
  isLive: boolean("is_live").default(false),
});

export const quizQuestions = pgTable("quiz_questions", {
  id: serial("id").primaryKey(),
  configId: integer("config_id").notNull().references(() => chatConfigs.id),
  question: text("question").notNull(),
  expectedAnswer: text("expected_answer").notNull(),
  orderIndex: integer("order_index").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deleted: boolean("deleted").default(false).notNull(),
  deletedAt: timestamp("deleted_at"),
});

export const conversations = pgTable("conversations", {
  configId: integer("config_id").notNull().references(() => chatConfigs.id),
  sessionId: text("session_id").notNull(),
  userName: text("user_name"),
  chatMode: text("chat_mode"),
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

export const quizResponses = pgTable("quiz_responses", {
  configId: integer("config_id").notNull().references(() => chatConfigs.id),
  sessionId: text("session_id").notNull(),
  userName: text("user_name"),
  feedback: jsonb("feedback").$type<Record<number, {
    status: 'correct' | 'almost' | 'incorrect';
    feedback: string;
    answer: string;
  }>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.configId, table.sessionId] })
}));

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
  manual?: boolean;
}

export interface DualConversationFeedback {
  overall: {
    bullets: string[];
    score: number;
    summary: string | null;
  };
  communication_skills: {
    bullets: string[];
    score: number;
    summary: string | null;
  };
  content_quality: {
    bullets: string[];
    score: number;
    summary: string | null;
  };
}

export interface UploadFeedback {
  bullets: string[];
  score: number;
  summary: string | null;
}

export const userRelations = relations(users, ({ many }) => ({
  chatConfigs: many(chatConfigs),
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
  chatConfigs: many(chatConfigs),
}));

export const chatConfigsRelations = relations(chatConfigs, ({ one, many }) => ({
  user: one(users, {
    fields: [chatConfigs.userId],
    references: [users.id],
  }),
  session: one(sessions, {
    fields: [chatConfigs.sessionId],
    references: [sessions.id],
  }),
  conversations: many(conversations),
  uploads: many(uploads),
  quizQuestions: many(quizQuestions),
  quizResponses: many(quizResponses),
  dualConversations: many(dualConversations),
  quickFireQuizQuestions: many(quickFireQuizQuestions),
  quickFireQuizState: one(quickFireQuizState, { fields: [chatConfigs.id], references: [quickFireQuizState.configId] }),
  quickFireQuizResponses: many(quickFireQuizResponses),
}));

export const quizQuestionsRelations = relations(quizQuestions, ({ one }) => ({
  config: one(chatConfigs, {
    fields: [quizQuestions.configId],
    references: [chatConfigs.id],
  }),
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

export const quizResponsesRelations = relations(quizResponses, ({ one }) => ({
  config: one(chatConfigs, {
    fields: [quizResponses.configId],
    references: [chatConfigs.id],
  }),
}));

export const dualConversations = pgTable("dual_conversations", {
  configId: integer("config_id").notNull().references(() => chatConfigs.id),
  sessionId: text("session_id").notNull(),
  participant1Name: text("participant1_name"),
  participant2Name: text("participant2_name"),
  transcript: jsonb("transcript").$type<{role: 'participant1' | 'participant2', content: string, timestamp: number}[]>().notNull().default([]),
  audioUrl: text("audio_url"),
  feedback: jsonb("feedback").$type<DualConversationFeedback>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.configId, table.sessionId] })
}));

export const dualConversationsRelations = relations(dualConversations, ({ one }) => ({
  config: one(chatConfigs, {
    fields: [dualConversations.configId],
    references: [chatConfigs.id],
  }),
}));

// ─── Quick Fire Quiz ──────────────────────────────────────────────────────────

export const quickFireQuizQuestions = pgTable("quick_fire_quiz_questions", {
  id: serial("id").primaryKey(),
  configId: integer("config_id").notNull().references(() => chatConfigs.id),
  question: text("question").notNull(),
  options: jsonb("options").$type<string[]>().notNull(),
  correctIndex: integer("correct_index").notNull(),
  orderIndex: integer("order_index").notNull(),
  timeLimit: integer("time_limit").notNull().default(30),
  createdAt: timestamp("created_at").defaultNow(),
});

export const quickFireQuizState = pgTable("quick_fire_quiz_state", {
  configId: integer("config_id").primaryKey().references(() => chatConfigs.id),
  phase: text("phase").notNull().default("waiting"),
  currentQuestionIndex: integer("current_question_index").notNull().default(-1),
  questionStartedAt: timestamp("question_started_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const quickFireQuizResponses = pgTable("quick_fire_quiz_responses", {
  id: serial("id").primaryKey(),
  configId: integer("config_id").notNull().references(() => chatConfigs.id),
  questionId: integer("question_id").notNull().references(() => quickFireQuizQuestions.id),
  participantId: text("participant_id").notNull(),
  userName: text("user_name"),
  selectedIndex: integer("selected_index").notNull(),
  responseTimeMs: integer("response_time_ms").notNull(),
  points: integer("points").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniq: unique().on(table.configId, table.questionId, table.participantId),
}));

export const quickFireQuizQuestionsRelations = relations(quickFireQuizQuestions, ({ one }) => ({
  config: one(chatConfigs, { fields: [quickFireQuizQuestions.configId], references: [chatConfigs.id] }),
}));

export const quickFireQuizStateRelations = relations(quickFireQuizState, ({ one }) => ({
  config: one(chatConfigs, { fields: [quickFireQuizState.configId], references: [chatConfigs.id] }),
}));

export const quickFireQuizResponsesRelations = relations(quickFireQuizResponses, ({ one }) => ({
  config: one(chatConfigs, { fields: [quickFireQuizResponses.configId], references: [chatConfigs.id] }),
  question: one(quickFireQuizQuestions, { fields: [quickFireQuizResponses.questionId], references: [quickFireQuizQuestions.id] }),
}));

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertChatConfigSchema = createInsertSchema(chatConfigs);
export const selectChatConfigSchema = createSelectSchema(chatConfigs);
export const insertQuizQuestionSchema = createInsertSchema(quizQuestions);
export const selectQuizQuestionSchema = createSelectSchema(quizQuestions);
export const insertConversationSchema = createInsertSchema(conversations);
export const selectConversationSchema = createSelectSchema(conversations);
export const insertUploadSchema = createInsertSchema(uploads);
export const selectUploadSchema = createSelectSchema(uploads);
export const insertQuizResponseSchema = createInsertSchema(quizResponses);
export const selectQuizResponseSchema = createSelectSchema(quizResponses);
export const insertSessionSchema = createInsertSchema(sessions);
export const selectSessionSchema = createSelectSchema(sessions);
export type InsertSession = typeof sessions.$inferInsert;
export type SelectSession = typeof sessions.$inferSelect;

export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;
export type InsertChatConfig = typeof chatConfigs.$inferInsert;
export type SelectChatConfig = typeof chatConfigs.$inferSelect;
export type InsertQuizQuestion = typeof quizQuestions.$inferInsert;
export type SelectQuizQuestion = typeof quizQuestions.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
export type SelectConversation = typeof conversations.$inferSelect;
export type InsertUpload = typeof uploads.$inferInsert;
export type SelectUpload = typeof uploads.$inferSelect;
export type InsertQuizResponse = typeof quizResponses.$inferInsert;
export type SelectQuizResponse = typeof quizResponses.$inferSelect;
export type InsertQuickFireQuizQuestion = typeof quickFireQuizQuestions.$inferInsert;
export type SelectQuickFireQuizQuestion = typeof quickFireQuizQuestions.$inferSelect;
export type InsertQuickFireQuizState = typeof quickFireQuizState.$inferInsert;
export type SelectQuickFireQuizState = typeof quickFireQuizState.$inferSelect;
export type InsertQuickFireQuizResponse = typeof quickFireQuizResponses.$inferInsert;
export type SelectQuickFireQuizResponse = typeof quickFireQuizResponses.$inferSelect;