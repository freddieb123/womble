import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db, pool } from "@db";
import { chatConfigs, conversations, uploads, quizQuestions, quizResponses, dualConversations, sessions, quickFireQuizQuestions, quickFireQuizState, quickFireQuizResponses, groupBoardPostIts, groupBoardComments, type Message, type ConversationFeedback, type UploadFeedback, type DualConversationFeedback } from "@db/schema";
import { broadcastBoardState } from "./routes/group-board-ws";
import { eq, and, or, desc, count, isNull } from "drizzle-orm";
import { saveAudio, handleSaveAudio, transcribeAudio, generateFeedback } from "./routes/dual-conversation";
import { registerPresentationRoutes } from "./routes/presentations";
import { z } from "zod";
import crypto from 'crypto';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/dist/resources/chat/completions';
import AdmZip from 'adm-zip';

function harshnessGuidance(level: string | null | undefined): string {
  switch (level) {
    case 'encouraging':
      return 'Use an encouraging, supportive tone. A score of 7–8 reflects solid effort and covers the main points; 9–10 for genuinely excellent work. Be generous — reward engagement and good intent even if some depth is missing.';
    case 'developmental':
      return 'Use a constructive, developmental tone. A score of 6–7 reflects good effort; 8–9 for strong performance that covers most criteria well; 9–10 only for outstanding work.';
    case 'high-performance':
      return 'Apply high-performance standards. A score of 5–6 reflects competent work that covers the basics; 7–8 for strong, well-reasoned responses; 9–10 only for exceptional depth and quality that clearly exceeds expectations.';
    case 'elite':
      return 'Apply elite, rigorous standards. A score of 4–5 is decent — it shows understanding but lacks depth. A 6–7 is good. An 8–9 is excellent and should only be awarded when the response covers all criteria with real insight and specificity. Only a truly outstanding, comprehensive response warrants a 9–10. Do not be generous — superficial coverage of points should score no higher than 5.';
    default: // 'standard'
      return 'Use a standard 1–10 scale. A score of 5–6 is average and meets most criteria adequately; 7–8 is good and covers criteria well; 9–10 is excellent and should be reserved for thorough, high-quality responses.';
  }
}

// ── In-memory activity timers ─────────────────────────────────────────────────
interface TimerState {
  totalSeconds: number;
  remainingAtLastAction: number;
  startedAt: number | null; // Date.now() ms
  status: 'idle' | 'running' | 'paused' | 'finished';
}
const activityTimers = new Map<number, TimerState>();

function getTimerRemaining(t: TimerState): number {
  if (t.status === 'running' && t.startedAt !== null) {
    return Math.max(0, t.remainingAtLastAction - (Date.now() - t.startedAt) / 1000);
  }
  return t.remainingAtLastAction;
}

// In-memory participant tracking for quick-fire quiz waiting room
const quizParticipants = new Map<number, Map<string, number>>(); // configId -> participantId -> lastSeen ms

function getActiveParticipants(configId: number): number {
  const now = Date.now();
  const map = quizParticipants.get(configId);
  if (!map) return 0;
  for (const [pid, ts] of map) {
    if (now - ts > 30_000) map.delete(pid);
  }
  return map.size;
}

const uploadFeedbackSchema = z.object({
  configId: z.number(),
  sessionId: z.string(),
  fileContent: z.string(),
  fileName: z.string(),
  userName: z.string().nullable(),
});

// Update the quiz question schema for better validation
const quizQuestionSchema = z.object({
  question: z.string().min(1, "Question is required"),
  expectedAnswer: z.string().min(1, "Expected answer is required")
});

const chatConfigSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.enum(['chat', 'upload', 'quiz', 'two-way-conversation', 'teach-ai', 'thought-partner', 'quick-fire-quiz', 'group-board', 'user-tester', 'doc-critique', 'task-walkthrough']).default('chat'),
  groupBoardSettings: z.object({
    numGroups: z.number().int().min(2).max(8),
    groupLabels: z.array(z.string()).optional(),
    boardInstructions: z.string().optional(),
    showOtherGroups: z.boolean().optional(),
  }).nullable().optional(),
  systemPrompt: z.string().optional().default(''),
  userInstructions: z.string().nullable(),
  feedbackCriteria: z.string().nullable(),
  feedbackHarshness: z.enum(['encouraging', 'developmental', 'standard', 'high-performance', 'elite']).optional().default('standard'),
  questions: z.array(quizQuestionSchema).optional(),
  quickFireQuestions: z.array(z.object({
    question: z.string().min(1),
    options: z.array(z.string()).length(4),
    correctIndex: z.number().int().min(0).max(3),
    timeLimit: z.number().int().min(5).max(120).default(30),
    orderIndex: z.number().int(),
  })).optional(),
  participant1Role: z.string().nullable().optional(),
  participant2Role: z.string().nullable().optional(),
  knowledgeLevel: z.number().int().min(0).max(4).nullable().optional(),
  attitude: z.number().int().min(0).max(4).nullable().optional(),
  coachingStyle: z.number().int().min(0).max(4).nullable().optional(),
  referenceContent: z.string().nullable().optional(),
  referenceImages: z.array(z.string()).nullable().optional(),
  interactionMode: z.enum(['typed', 'spoken', 'both']).default('both').optional(),
});

const KNOWLEDGE_LABELS = ['a complete beginner with no prior knowledge', 'a novice with some basic awareness', 'someone with intermediate understanding', 'an advanced learner with solid knowledge', 'an expert who already knows most of the subject'];
const ATTITUDE_LABELS = ['very enthusiastic and eager to learn', 'curious and engaged', 'neutral and professional', 'somewhat skeptical and questioning', 'very skeptical and challenging'];

function buildTeachAiSystemPrompt(userInstructions: string | null, knowledgeLevel: number, attitude: number): string {
  return `You are playing the role of a learner. The person you are talking to is going to teach you something. Your only job is to be taught — not to teach, explain, or demonstrate knowledge.

The topic you are being taught about:
${userInstructions || 'A topic the user will explain to you.'}

Your knowledge level: You are ${KNOWLEDGE_LABELS[knowledgeLevel]}. This means you know ${knowledgeLevel === 0 ? 'nothing at all' : knowledgeLevel === 1 ? 'very little' : knowledgeLevel === 2 ? 'a small amount' : knowledgeLevel === 3 ? 'quite a lot already' : 'almost everything'} about this topic.

Your attitude: You are ${ATTITUDE_LABELS[attitude]}.

OPENING MESSAGE RULE (critical):
Your very first message — no matter what the user says to open — must be a simple, natural invitation for them to teach you. Use the topic name from the instructions above. For example: "Oh great, please help me learn about [topic]! Where should I start?" or "I'd love to understand [topic] better — can you explain it to me?" Keep it short and enthusiastic (even if your general attitude is skeptical — save the skepticism for after they've explained something).

STRICT BEHAVIOURAL RULES — these override everything else:
1. NEVER give explanations, definitions, or answers. You are here to receive knowledge, not share it.
2. NEVER summarise or repeat back information in a way that could teach the user. If you reflect understanding, you may get things slightly wrong — that is fine and realistic.
3. Keep every response to 1–3 sentences maximum. You are the learner; the user should be doing most of the talking.
4. React to what the user tells you: ask one follow-up question at a time, or say you don't understand and ask them to explain further.
5. Your confusion and questions must match your knowledge level — a beginner asks very basic questions; an expert pushes back with more specific challenges.
6. Never break character or acknowledge you are an AI.
7. Do not list things, give structured responses, or use bullet points — speak naturally as a learner would.`;
}

const COACHING_STYLE_LABELS = [
  'a pure coach — you ask open-ended, exploratory questions only. You never give opinions, recommendations, or direct advice. You help the person find their own answers through powerful questions.',
  'a coaching-led partner — you mostly ask questions, but occasionally offer a relevant framework or model to help structure thinking. You hold back your own views.',
  'a balanced thought partner — you mix open questions with occasional suggestions and frameworks. You share perspectives but always anchor them to the person\'s specific context.',
  'a thoughtful advisor — you lean towards sharing frameworks, observations and recommendations, but always invite the person to test them against their own situation.',
  'a direct advisor — you offer clear recommendations and frameworks. You are directive and confident in your guidance, while remaining open to the person\'s context.',
];

function buildThoughtPartnerSystemPrompt(userInstructions: string | null, referenceContent: string | null, coachingStyle: number): string {
  const styleLabel = COACHING_STYLE_LABELS[coachingStyle];
  return `You are a thought partner helping someone think through a topic, idea, or challenge in the context of their own situation. You are ${styleLabel}

THE TOPIC / FOCUS AREA:
${userInstructions || 'A topic the user will share with you at the start.'}

${referenceContent ? `REFERENCE MATERIAL — use this to inform your questions and responses:
${referenceContent}` : ''}

OPENING MESSAGE RULE (critical):
Your very first message must introduce the topic briefly and invite the person to share their context. For example: "I'm here to help you think through ${userInstructions || 'this topic'}. To make this as useful as possible — tell me a bit about your situation and where you're starting from." Keep it warm and concise.

BEHAVIOURAL RULES:
1. Always anchor your responses to the person's specific context — don't give generic advice.
2. Never lecture or give long explanations unprompted.
3. Ask one thing at a time — don't stack multiple questions.
4. Build on what the person has said; don't repeat questions they've already answered.
5. If you reference a framework or model from the reference material, introduce it briefly and ask how it applies to their situation.
6. Keep responses concise — 2–4 sentences maximum unless you're introducing a framework.
7. Never break character or acknowledge you are an AI.`;
}

function buildDocCritiqueSystemPrompt(feedbackCriteria: string | null, userInstructions: string | null): string {
  return `You are a learning coach reviewing an apprentice's observations about a document. The apprentice has read the document and will share what they notice, interpret, or analyse.

${feedbackCriteria ? `KEY THINGS TO LOOK FOR — what a strong response should identify:\n${feedbackCriteria}` : ''}

${userInstructions ? `Additional context:\n${userInstructions}` : ''}

YOUR ROLE:
- When the apprentice shares an observation, acknowledge what's correct, gently correct any misunderstandings, and probe deeper with one follow-up question.
- Guide them towards things they've missed without simply giving the answer — use questions to prompt their thinking.
- Keep each response to 2–3 sentences. You are guiding, not lecturing.
- At the end, offer a brief summary of what they identified well and what they missed.
- Never break character or acknowledge you are an AI.`;
}

function buildTaskWalkthroughSystemPrompt(referenceContent: string | null, feedbackCriteria: string | null): string {
  return `You are a coaching assistant helping an apprentice work through a task. Your role is to understand exactly where they are, then coach them through the remaining steps.

${referenceContent ? `THE TASK:\n${referenceContent}` : 'A task the apprentice will describe to you.'}

${feedbackCriteria ? `COMPLETION CRITERIA — what a fully completed task looks like:\n${feedbackCriteria}` : ''}

HOW TO BEHAVE:
- Start by asking the apprentice to explain what task they were given and how far they've got.
- Listen carefully. Ask one clarifying question at a time to understand exactly what they've done and where they're stuck.
- Once you understand their position, give clear step-by-step guidance on what to do next — be specific and practical.
- Do not complete the task for them. Guide them through it one step at a time.
- Keep responses to 3–5 sentences. Be concrete and actionable.
- Adapt your language to the task — if it's technical (e.g. Excel), use the right terminology.
- Never break character or acknowledge you are an AI.`;
}

function buildUserTesterSystemPrompt(feedbackCriteria: string | null, userInstructions: string | null): string {
  return `You are a UX evaluator observing a live prototype demo via screen share and audio narration.

The presenter will walk you through their prototype. Watch the screen carefully and listen to their narration. Ask short, probing questions to understand their design decisions. Be curious, constructive, and conversational. Keep your responses brief (1–3 sentences) — you are watching and reacting, not lecturing.

${feedbackCriteria ? `Evaluation criteria — use these to guide your questions and final feedback:\n${feedbackCriteria}` : ''}

${userInstructions ? `Additional context:\n${userInstructions}` : ''}

When the presenter says they are finished or asks for a summary: give structured feedback covering what worked well against the criteria, what needs improvement, and one or two specific suggestions. Be honest but encouraging.`;
}

const configSchema = z.object({
  systemPrompt: z.string(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(100).max(4000).default(1000),
  referenceImages: z.array(z.string()).nullable().optional(),
  type: z.string().optional(),
});

// Add this near other schema definitions
const quizSubmissionSchema = z.object({
  configId: z.number(),
  sessionId: z.string(),
  userName: z.string(),
  questions: z.array(z.object({
    question: z.string(),
    expectedAnswer: z.string()
  })),
  answers: z.array(z.object({
    questionIndex: z.number(),
    answer: z.string(),
    expectedAnswer: z.string()
  }))
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: false
});

// Store message sessions in memory
const messageSessions: Record<string, Message[]> = {};

export function registerRoutes(app: Express): Server {
  // Add chat_mode column if it doesn't exist yet
  pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS chat_mode TEXT`).catch(() => {});
  // Add interaction_mode column if it doesn't exist yet
  pool.query(`ALTER TABLE chat_configs ADD COLUMN IF NOT EXISTS interaction_mode TEXT DEFAULT 'both'`).catch(() => {});
  // Sessions feature migrations
  pool.query(`CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    share_token TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
  )`).catch(() => {});
  pool.query(`ALTER TABLE chat_configs ADD COLUMN IF NOT EXISTS session_id INTEGER REFERENCES sessions(id)`).catch(() => {});
  pool.query(`ALTER TABLE chat_configs ADD COLUMN IF NOT EXISTS session_order INTEGER`).catch(() => {});
  pool.query(`ALTER TABLE chat_configs ADD COLUMN IF NOT EXISTS is_live BOOLEAN DEFAULT false`).catch(() => {});
  pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'New Session'`).catch(() => {});
  pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`).catch(() => {});
  pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_library BOOLEAN NOT NULL DEFAULT false`).catch(() => {});

  pool.query(`ALTER TABLE chat_configs ADD COLUMN IF NOT EXISTS group_board_settings JSONB`).catch(() => {});
  pool.query(`CREATE TABLE IF NOT EXISTS group_board_post_its (
    id SERIAL PRIMARY KEY,
    config_id INTEGER NOT NULL REFERENCES chat_configs(id),
    group_number INTEGER NOT NULL,
    author_name TEXT NOT NULL DEFAULT 'Anonymous',
    text TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#fbbf24',
    pos_x INTEGER NOT NULL DEFAULT 10,
    pos_y INTEGER NOT NULL DEFAULT 10,
    is_trainer BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
  )`).catch(() => {});
  pool.query(`CREATE TABLE IF NOT EXISTS group_board_comments (
    id SERIAL PRIMARY KEY,
    config_id INTEGER NOT NULL REFERENCES chat_configs(id),
    group_number INTEGER NOT NULL,
    type TEXT NOT NULL DEFAULT 'text',
    content TEXT,
    audio_url TEXT,
    author_name TEXT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
  )`).catch(() => {});

  pool.query(`CREATE TABLE IF NOT EXISTS quick_fire_quiz_questions (
    id SERIAL PRIMARY KEY,
    config_id INTEGER NOT NULL REFERENCES chat_configs(id),
    question TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_index INTEGER NOT NULL,
    order_index INTEGER NOT NULL,
    time_limit INTEGER NOT NULL DEFAULT 30,
    created_at TIMESTAMP DEFAULT NOW()
  )`).catch(() => {});

  pool.query(`CREATE TABLE IF NOT EXISTS quick_fire_quiz_state (
    config_id INTEGER PRIMARY KEY REFERENCES chat_configs(id),
    phase TEXT NOT NULL DEFAULT 'waiting',
    current_question_index INTEGER NOT NULL DEFAULT -1,
    question_started_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
  )`).catch(() => {});

  pool.query(`CREATE TABLE IF NOT EXISTS quick_fire_quiz_responses (
    id SERIAL PRIMARY KEY,
    config_id INTEGER NOT NULL REFERENCES chat_configs(id),
    question_id INTEGER NOT NULL REFERENCES quick_fire_quiz_questions(id),
    participant_id TEXT NOT NULL,
    user_name TEXT,
    selected_index INTEGER NOT NULL,
    response_time_ms INTEGER NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (config_id, question_id, participant_id)
  )`).catch(() => {});

  // Presentations feature migrations
  pool.query(`CREATE TABLE IF NOT EXISTS presentations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL DEFAULT 'New Presentation',
    share_token TEXT NOT NULL UNIQUE,
    frames JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`).catch(() => {});
  pool.query(`CREATE TABLE IF NOT EXISTS presentation_state (
    presentation_id INTEGER PRIMARY KEY REFERENCES presentations(id),
    phase TEXT NOT NULL DEFAULT 'waiting',
    current_frame INTEGER NOT NULL DEFAULT 0,
    fullscreen_mode BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMP DEFAULT NOW()
  )`).catch(() => {});
  // HTML deck columns
  pool.query(`ALTER TABLE presentations ADD COLUMN IF NOT EXISTS html_content TEXT`).catch(() => {});
  pool.query(`ALTER TABLE presentations ADD COLUMN IF NOT EXISTS original_filename TEXT`).catch(() => {});
  pool.query(`ALTER TABLE presentations ADD COLUMN IF NOT EXISTS session_id INTEGER REFERENCES sessions(id)`).catch(() => {});
  pool.query(`ALTER TABLE presentation_state ADD COLUMN IF NOT EXISTS last_action TEXT`).catch(() => {});
  pool.query(`ALTER TABLE presentation_state ADD COLUMN IF NOT EXISTS action_id TEXT`).catch(() => {});

  // Backfill: mark any existing "My Agents" sessions as library (runs after DDL has settled)
  setTimeout(() => {
    pool.query(`UPDATE sessions SET is_library = true WHERE title = 'My Agents' AND is_library = false`).catch(() => {});
  }, 1000);

  // Migrate orphaned agents (no sessionId) into a per-user "My Agents" session
  setTimeout(async () => {
    try {

      const orphaned = await db.query.chatConfigs.findMany({
        where: and(isNull(chatConfigs.sessionId), eq(chatConfigs.deleted, false)),
      });
      if (orphaned.length === 0) return;

      const byUser: Record<number, typeof orphaned> = {};
      for (const cfg of orphaned) {
        if (!byUser[cfg.userId]) byUser[cfg.userId] = [];
        byUser[cfg.userId].push(cfg);
      }

      for (const [userIdStr, cfgs] of Object.entries(byUser)) {
        const userId = parseInt(userIdStr);
        const [session] = await db.insert(sessions).values({
          userId,
          shareToken: crypto.randomUUID(),
          title: 'My Agents',
          isLibrary: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning();
        for (let i = 0; i < cfgs.length; i++) {
          await db.update(chatConfigs)
            .set({ sessionId: session.id, sessionOrder: i, isLive: i === 0 })
            .where(eq(chatConfigs.id, cfgs[i].id));
        }
      }
    } catch (e) {
      console.error('Orphan migration error:', e);
    }
  }, 2000);;

  // Set up authentication routes and middleware
  setupAuth(app);

  // Middleware to check authentication for API routes
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  // Chat configs routes
  app.get("/api/chat-configs", requireAuth, async (req: Request, res: Response) => {
    try {
      const rawUserId = req.user?.id;
      console.log('GET /api/chat-configs - Raw user ID:', rawUserId, 'Type:', typeof rawUserId);

      const userId = typeof rawUserId === 'string' ? parseInt(rawUserId, 10) : typeof rawUserId === 'number' ? rawUserId : null;
      console.log('GET /api/chat-configs - Parsed user ID:', userId, 'Type:', typeof userId);

      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const whereClause = and(
        eq(chatConfigs.deleted, false),
        eq(chatConfigs.userId, userId)
      );

      console.log('Constructed whereClause:', whereClause);

      const configs = await db.query.chatConfigs.findMany({
        where: whereClause,
        orderBy: [desc(chatConfigs.createdAt)],
        with: {
          conversations: true,
          uploads: true,
          quizResponses: true,
          dualConversations: true,
        }
      });

      console.log('Found configs:', configs.map(c => ({
        id: c.id,
        title: c.title,
        userId: c.userId
      })));

      const configsWithCount = configs.map(config => {
        let responseCount;
        if (config.type === 'upload') {
          responseCount = config.uploads.length;
        } else if (config.type === 'quiz') {
          responseCount = config.quizResponses.length;
        } else if (config.type === 'two-way-conversation') {
          responseCount = config.dualConversations?.length || 0;
        } else {
          responseCount = config.conversations.length;
        }

        return {
          ...config,
          conversationCount: responseCount,
          conversations: undefined,
          uploads: undefined,
          quizResponses: undefined,
          dualConversations: undefined
        };
      });

      console.log('GET /api/chat-configs - Sending response:', {
        count: configsWithCount.length,
        configs: configsWithCount.map(c => ({
          id: c.id,
          title: c.title,
          type: c.type,
          userId: c.userId
        }))
      });
      res.json(configsWithCount);
    } catch (error: any) {
      console.error("Error fetching chat configs:", error);
      console.error("Error stack:", error.stack);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/chat-configs/:id", async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.id);
      const userId = req.user?.id;
      console.log(userId)

      if (isNaN(configId)) {
        return res.status(400).json({ error: "Invalid config ID" });
      }

      const config = await db.query.chatConfigs.findFirst({
        where: eq(chatConfigs.id, configId),
        with: {
          quizQuestions: {
            where: eq(quizQuestions.deleted, false),
            orderBy: [quizQuestions.orderIndex],
          },
          quickFireQuizQuestions: {
            orderBy: [quickFireQuizQuestions.orderIndex],
          },
        }
      });

      if (!config) {
        return res.status(404).json({ error: "Configuration not found" });
      }

      // Transform the response to match the expected format
      const responseConfig = {
        ...config,
        questions: config.type === 'quiz' && config.quizQuestions ? config.quizQuestions.map(q => ({
          question: q.question,
          expectedAnswer: q.expectedAnswer
        })) : [],
        quickFireQuestions: config.type === 'quick-fire-quiz' ? config.quickFireQuizQuestions : undefined,
        quizQuestions: undefined,
        quickFireQuizQuestions: undefined,
      };

      res.json(responseConfig);
    } catch (error: any) {
      console.error("Error fetching chat config:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/chat-configs", requireAuth, async (req: Request, res: Response) => {
    try {
      const { title, type, systemPrompt, userInstructions, feedbackCriteria, feedbackHarshness, questions, quickFireQuestions, participant1Role, participant2Role, knowledgeLevel, attitude, coachingStyle, referenceContent, referenceImages, interactionMode, groupBoardSettings } = chatConfigSchema.parse(req.body);
      const sessionId: number | null = req.body.sessionId ?? null;

      // Get the user ID from the authenticated request
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Validate quiz type has questions
      if (type === 'quiz' && (!questions || questions.length === 0)) {
        return res.status(400).json({ error: "Quiz type requires at least one question" });
      }

      const autoGeneratedTypes = ['teach-ai', 'thought-partner', 'quick-fire-quiz', 'group-board', 'user-tester', 'doc-critique', 'task-walkthrough'];
      if (!autoGeneratedTypes.includes(type) && !systemPrompt?.trim()) {
        return res.status(400).json({ error: "System prompt is required" });
      }

      const resolvedSystemPrompt = type === 'teach-ai'
        ? buildTeachAiSystemPrompt(userInstructions, knowledgeLevel ?? 2, attitude ?? 2)
        : type === 'thought-partner'
        ? buildThoughtPartnerSystemPrompt(userInstructions, referenceContent ?? null, coachingStyle ?? 2)
        : type === 'group-board'
        ? ''
        : type === 'user-tester'
        ? buildUserTesterSystemPrompt(feedbackCriteria ?? null, userInstructions ?? null)
        : type === 'doc-critique'
        ? buildDocCritiqueSystemPrompt(feedbackCriteria ?? null, userInstructions ?? null)
        : type === 'task-walkthrough'
        ? buildTaskWalkthroughSystemPrompt(referenceContent ?? null, feedbackCriteria ?? null)
        : systemPrompt!;

      // Assign to session if provided
      let assignedSessionOrder: number | null = null;
      let assignedIsLive = false;
      if (sessionId) {
        const existing = await db.query.chatConfigs.findMany({
          where: and(eq(chatConfigs.sessionId, sessionId), eq(chatConfigs.deleted, false)),
        });
        assignedSessionOrder = existing.length;
        assignedIsLive = existing.length === 0;
        await db.update(sessions).set({ updatedAt: new Date() }).where(eq(sessions.id, sessionId));
      }

      const newConfig = await db.insert(chatConfigs).values({
        title,
        type,
        systemPrompt: resolvedSystemPrompt,
        userInstructions,
        feedbackCriteria,
        participant1Role: participant1Role ?? null,
        participant2Role: participant2Role ?? null,
        knowledgeLevel: knowledgeLevel ?? null,
        attitude: attitude ?? null,
        coachingStyle: coachingStyle ?? null,
        referenceContent: referenceContent ?? null,
        referenceImages: referenceImages ?? null,
        interactionMode: interactionMode ?? 'both',
        feedbackHarshness: feedbackHarshness ?? 'standard',
        groupBoardSettings: groupBoardSettings ?? null,
        userId,
        deleted: false,
        createdAt: new Date(),
        sessionId: sessionId ?? null,
        sessionOrder: assignedSessionOrder,
        isLive: assignedIsLive,
      }).returning();

      // If this is a quiz type and questions were provided, save them
      if (type === 'quiz' && questions && questions.length > 0) {
        const questionsToInsert = questions.map((q, index) => ({
          configId: newConfig[0].id,
          question: q.question,
          expectedAnswer: q.expectedAnswer,
          orderIndex: index,
          createdAt: new Date(),
          deleted: false
        }));

        await db.insert(quizQuestions).values(questionsToInsert);
      }

      if (type === 'quick-fire-quiz' && quickFireQuestions && quickFireQuestions.length > 0) {
        await db.insert(quickFireQuizQuestions).values(
          quickFireQuestions.map((q, i) => ({
            configId: newConfig[0].id,
            question: q.question,
            options: q.options,
            correctIndex: q.correctIndex,
            orderIndex: i,
            timeLimit: q.timeLimit ?? 30,
          }))
        );
        await db.insert(quickFireQuizState).values({ configId: newConfig[0].id }).onConflictDoNothing();
      }

      res.json(newConfig[0]);
    } catch (error: any) {
      console.error("Error creating chat config:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/chat-configs/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.id);
      const userId = req.user?.id;

      if (isNaN(configId)) {
        return res.status(400).json({ error: "Invalid config ID" });
      }

      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // First check if the user owns this config
      const existingConfig = await db.query.chatConfigs.findFirst({
        where: and(
          eq(chatConfigs.id, configId),
          eq(chatConfigs.userId, userId)
        ),
      });

      if (!existingConfig) {
        return res.status(403).json({ error: "You don't have permission to modify this configuration" });
      }

      const { title, type, systemPrompt, userInstructions, feedbackCriteria, feedbackHarshness, questions, quickFireQuestions, participant1Role, participant2Role, knowledgeLevel, attitude, coachingStyle, referenceContent, referenceImages, interactionMode, groupBoardSettings } = chatConfigSchema.parse(req.body);

      const autoGeneratedTypes = ['teach-ai', 'thought-partner', 'quick-fire-quiz', 'group-board', 'user-tester', 'doc-critique', 'task-walkthrough'];
      if (!autoGeneratedTypes.includes(type) && !systemPrompt?.trim()) {
        return res.status(400).json({ error: "System prompt is required" });
      }

      const resolvedSystemPrompt = type === 'teach-ai'
        ? buildTeachAiSystemPrompt(userInstructions, knowledgeLevel ?? 2, attitude ?? 2)
        : type === 'thought-partner'
        ? buildThoughtPartnerSystemPrompt(userInstructions, referenceContent ?? null, coachingStyle ?? 2)
        : type === 'group-board'
        ? ''
        : type === 'user-tester'
        ? buildUserTesterSystemPrompt(feedbackCriteria ?? null, userInstructions ?? null)
        : type === 'doc-critique'
        ? buildDocCritiqueSystemPrompt(feedbackCriteria ?? null, userInstructions ?? null)
        : type === 'task-walkthrough'
        ? buildTaskWalkthroughSystemPrompt(referenceContent ?? null, feedbackCriteria ?? null)
        : systemPrompt!;

      const updatedConfig = await db.update(chatConfigs)
        .set({
          title,
          type,
          systemPrompt: resolvedSystemPrompt,
          userInstructions,
          feedbackCriteria,
          participant1Role: participant1Role ?? null,
          participant2Role: participant2Role ?? null,
          knowledgeLevel: knowledgeLevel ?? null,
          attitude: attitude ?? null,
          coachingStyle: coachingStyle ?? null,
          referenceContent: referenceContent ?? null,
          referenceImages: referenceImages ?? null,
          interactionMode: interactionMode ?? 'both',
          feedbackHarshness: feedbackHarshness ?? 'standard',
          groupBoardSettings: groupBoardSettings ?? null,
        })
        .where(and(
          eq(chatConfigs.id, configId),
          eq(chatConfigs.userId, userId)
        ))
        .returning();

      if (type === 'quiz') {
        await db.delete(quizQuestions).where(eq(quizQuestions.configId, configId));
        if (questions && questions.length > 0) {
          await db.insert(quizQuestions).values(questions.map((q, index) => ({
            configId,
            question: q.question,
            expectedAnswer: q.expectedAnswer,
            orderIndex: index,
            createdAt: new Date(),
            deleted: false
          })));
        }
      }

      if (type === 'quick-fire-quiz') {
        await db.delete(quickFireQuizQuestions).where(eq(quickFireQuizQuestions.configId, configId));
        if (quickFireQuestions && quickFireQuestions.length > 0) {
          await db.insert(quickFireQuizQuestions).values(quickFireQuestions.map((q, i) => ({
            configId,
            question: q.question,
            options: q.options,
            correctIndex: q.correctIndex,
            orderIndex: i,
            timeLimit: q.timeLimit ?? 30,
          })));
        }
        await db.insert(quickFireQuizState).values({ configId }).onConflictDoNothing();
      }

      if (!updatedConfig.length) {
        return res.status(404).json({ error: "Configuration not found" });
      }

      res.json(updatedConfig[0]);
    } catch (error: any) {
      console.error("Error updating chat config:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/configs/generate-with-ai", requireAuth, async (req: Request, res: Response) => {
    try {
      const { prompt, type } = req.body;
      if (!prompt) return res.status(400).json({ error: "Prompt is required" });

      const typeDescriptions: Record<string, string> = {
        chat: 'a one-to-one conversation between a learner and an AI playing a specific role',
        'two-way-conversation': 'a two-way conversation exercise between two human participants (the AI is not in the conversation — it observes and gives feedback afterwards)',
        'teach-ai': 'a "teach an AI" exercise where the learner explains a topic to an AI playing the role of a learner',
        'thought-partner': 'a thought partner session where an AI helps a learner think through how a concept or idea applies to their own context',
        'user-tester': 'a screen-share demo evaluation where a participant demos an app or prototype while an AI evaluator watches via screen share and listens via microphone, then gives spoken feedback and a structured assessment',
        'doc-critique': 'a document critique activity where apprentices read a provided document and type their observations, which an AI coach evaluates against what they should have noticed',
        'task-walkthrough': 'a voice-based coaching session where an apprentice describes how far they have got with a task and the AI coaches them through completing it',
      };
      const typeLabel = typeDescriptions[type] || 'a conversation with an AI assistant';

      const systemPromptInstruction = (type === 'teach-ai' || type === 'thought-partner' || type === 'doc-critique' || type === 'task-walkthrough')
        ? `"systemPrompt": Leave this as an empty string ("") — it is auto-generated for this activity type.`
        : type === 'user-tester'
        ? `"systemPrompt": A system prompt for an AI evaluator that watches a live screen-share demo and listens to the presenter via microphone. Write it as instructions directly to the AI starting with "You are...". It should:
- Describe the AI's role as a live evaluator watching a product/app demo
- Instruct it to ask probing questions during the demo (e.g. "Can you show me how you'd do X?")
- Instruct it to note observations about the app/prototype being shown (NOT about the presenter's communication skills)
- Instruct it to give a concise spoken summary of strengths and areas for improvement at the end
- Include the evaluation criteria inline under a heading "Evaluation criteria:"
- End with a section headed exactly "Instructions given to the presenter:" that describes what the presenter was told to do before the session — this tells the AI what to expect the presenter to cover, not instructions for the AI itself
- IMPORTANT: The AI must never introduce itself by name or claim to be any named product (e.g. never say "I'm Gemini"). It is simply an evaluator.
IMPORTANT: This field must not be empty.`
        : `"systemPrompt": A detailed, well-structured AI system prompt. Format it clearly using:
- A clear opening statement of the AI's role and persona
- Numbered or bulleted sections for key behaviours and rules
- Line breaks between sections
- Plain English, no jargon
${type === 'two-way-conversation' ? 'This prompt guides a feedback AI that analyses the conversation after it happens — write it accordingly.' : 'Write this as instructions directly to the AI, starting with "You are..."'}
IMPORTANT: This field must not be empty for this activity type.`;

      const feedbackCriteriaInstruction = type === 'user-tester'
        ? `"feedbackCriteria": Evaluation criteria for the APP or PROTOTYPE being demoed — not about the AI or the presenter's communication style. Each criterion should describe something observable about the product itself (e.g. "The navigation is intuitive and key actions are discoverable without instruction"). Return as plain text, one criterion per line starting with "- ". Do NOT use a JSON array. Include 4–6 criteria.`
        : type === 'doc-critique'
        ? `"feedbackCriteria": A list of things apprentices should notice or identify in the document — specific observations, interpretations, or analytical points that a strong response should include. Return as plain text, one criterion per line starting with "- ". Do NOT use a JSON array. Include 4–6 criteria.`
        : type === 'task-walkthrough'
        ? `"feedbackCriteria": Completion criteria — what the task looks like when fully and correctly completed. Each criterion should be a specific, observable outcome (e.g. "Pivot table shows total sales grouped by product category"). Return as plain text, one criterion per line starting with "- ". Do NOT use a JSON array. Include 4–6 criteria.`
        : `"feedbackCriteria": The criteria the AI uses when generating feedback. Return as plain text, one criterion per line starting with "- ". Do NOT use a JSON array. Include 4–6 criteria, each a single clear sentence.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are helping an admin create a workplace training exercise. Based on their description, generate the configuration for ${typeLabel}.

Return a JSON object with exactly these four fields:

"title": A short, punchy title (4–7 words max).

${systemPromptInstruction}

"userInstructions": Instructions shown to the participant before they start. Format using:
- A short intro sentence
- A bullet list of what they need to do / key points to cover
- Any context they need about the scenario
Keep it concise and actionable.

${feedbackCriteriaInstruction}

Return only valid JSON — no markdown fences, no extra keys.`
          },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      });

      const content = completion.choices[0].message.content;
      if (!content) throw new Error("Empty response from OpenAI");
      const raw = JSON.parse(content);
      console.log("generate-with-ai raw response:", JSON.stringify(raw, null, 2));
      const toString = (v: any): string =>
        v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      // Normalise field names — model may return camelCase, snake_case, or PascalCase variants
      const pick = (...keys: string[]) => keys.reduce((acc, k) => acc ?? raw[k], undefined as any);
      res.json({
        title: toString(pick('title', 'Title')),
        systemPrompt: toString(pick('systemPrompt', 'system_prompt', 'SystemPrompt', 'system_Prompt')),
        userInstructions: toString(pick('userInstructions', 'user_instructions', 'UserInstructions')),
        feedbackCriteria: toString(pick('feedbackCriteria', 'feedback_criteria', 'FeedbackCriteria')),
      });
    } catch (error: any) {
      console.error("Error generating config with AI:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/configs/enhance-prompt", requireAuth, async (req: Request, res: Response) => {
    try {
      const { prompt, type } = req.body;
      if (!prompt) return res.status(400).json({ error: "Prompt is required" });

      const typeDescriptions: Record<string, string> = {
        chat: 'a one-to-one conversation between a learner and an AI playing a specific role',
        'two-way-conversation': 'a two-way conversation exercise between two human participants',
        'teach-ai': 'a "teach an AI" exercise where the learner explains a topic to an AI playing the role of a learner',
        'thought-partner': 'a thought partner session where an AI helps a learner think through how a concept applies to their context',
        'user-tester': 'a screen-share demo evaluation where a participant demos an app or prototype and an AI evaluator watches and gives spoken feedback on the product itself',
        'doc-critique': 'a document critique activity where apprentices read a document and share their observations for AI coaching',
        'task-walkthrough': 'a voice coaching session where an apprentice describes how far they got with a task and the AI coaches them through completing it',
      };
      const typeLabel = typeDescriptions[type] || 'a conversation with an AI assistant';

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are helping an admin describe a workplace learning activity of type: ${typeLabel}.

Their description may be brief or vague. Expand it into a richer, more detailed description that will produce a high-quality learning activity. Keep the same scenario and intent, but add:
- More context about the scenario and setting
- The specific skills or behaviours being practised
- What a good performance looks like for the learner
- Any relevant constraints, nuances, or edge cases to practise

Keep the tone conversational and direct. Write in the same voice as the original. Return only the enhanced description — no headings, no preamble, no explanation.`
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
      });

      const enhanced = completion.choices[0].message.content;
      if (!enhanced) throw new Error("Empty response from OpenAI");
      res.json({ enhanced });
    } catch (error: any) {
      console.error("Error enhancing prompt:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/suggest-activities", requireAuth, async (req: Request, res: Response) => {
    try {
      const { content, fileName, url } = req.body;
      let slideText = '';
      let slideCount: number | undefined;

      if (content) {
        const buffer = Buffer.from(content, 'base64');
        const { fileName: fn } = req.body;
        const ext = (fn || '').toLowerCase().split('.').pop();
        if (ext === 'pptx' || ext === 'ppt') {
          // PPTX is a ZIP of XML — extract text from slide XML files
          try {
            const zip = new AdmZip(buffer);
            const textParts: string[] = [];
            let pageCount = 0;
            for (const entry of zip.getEntries()) {
              if (/^ppt\/slides\/slide\d+\.xml$/.test(entry.entryName)) {
                pageCount++;
                const xml = entry.getData().toString('utf-8');
                const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
                for (const m of matches) {
                  const t = m.replace(/<[^>]+>/g, '').trim();
                  if (t) textParts.push(t);
                }
              }
            }
            slideText = textParts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 20000);
            slideCount = pageCount || undefined;
          } catch (e) {
            return res.status(400).json({ error: 'Could not parse PPTX file. Try exporting as PDF.' });
          }
        } else {
        // Pure-JS PDF text extraction (works for text-based PDFs e.g. slide exports)
        const data = buffer.toString('binary');
        const pageCount = (data.match(/\/Type\s*\/Page[^s]/g) || []).length;
        const textParts: string[] = [];
        const btEt = /BT([\s\S]*?)ET/g;
        let bm: RegExpExecArray | null;
        while ((bm = btEt.exec(data)) !== null) {
          const block = bm[1];
          const tj = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*(?:Tj|'|")/g;
          let tm: RegExpExecArray | null;
          while ((tm = tj.exec(block)) !== null) {
            const t = tm[1].replace(/\\n/g,'\n').replace(/\\\(/g,'(').replace(/\\\)/g,')').replace(/\\\\/g,'\\');
            if (t.trim()) textParts.push(t);
          }
          const tja = /\[([^\]]*)\]\s*TJ/g;
          let ta: RegExpExecArray | null;
          while ((ta = tja.exec(block)) !== null) {
            const parts = ta[1].match(/\(([^)\\]*(?:\\.[^)\\]*)*)\)/g) || [];
            for (const p of parts) {
              const t = p.slice(1,-1).replace(/\\n/g,'\n').replace(/\\\(/g,'(').replace(/\\\)/g,')');
              if (t.trim()) textParts.push(t);
            }
          }
        }
        slideText = textParts.join(' ').replace(/\s+/g,' ').trim().slice(0, 20000);
        slideCount = pageCount || undefined;
        } // end else (PDF)
      } else if (url) {
        let fetchUrl = url.trim();
        // Convert Google Slides share/edit URLs to the plain text export endpoint
        const gSlidesMatch = fetchUrl.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
        if (gSlidesMatch) {
          fetchUrl = `https://docs.google.com/presentation/d/${gSlidesMatch[1]}/export/txt`;
        }
        const resp = await fetch(fetchUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Womble/1.0)' },
          redirect: 'follow',
        });
        if (!resp.ok) {
          return res.status(400).json({ error: `Could not fetch that URL (status ${resp.status}). Make sure the link is set to "Anyone can view".` });
        }
        const contentType = resp.headers.get('content-type') || '';
        if (contentType.includes('text/plain')) {
          slideText = (await resp.text()).slice(0, 20000);
        } else {
          const html = await resp.text();
          slideText = html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 20000);
        }
      }

      if (!slideText.trim()) {
        return res.status(400).json({ error: 'Could not extract text from the provided content.' });
      }

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an expert learning designer for apprenticeship training programmes in the UK. You will be given the content of a training slide deck and must suggest learning activities.

QUANTITY RULE: Suggest roughly 3–5 activities per 10 slides. So a 10-slide deck → 3–5 suggestions; a 20-slide deck → 6–10; a 5-slide deck → 2–3. It is fine — and encouraged — to suggest more than one activity for the same group of slides when there are genuinely different good options (e.g. a role-play AND a quiz for the same content). The user will pick the best one.

ORDER RULE: Return activities in slide order — suggestions covering earlier slides come first.

Available activity types:
- "chat": Learner has a role-play conversation with an AI playing a character — great for practising interactions, applying principles in a scenario, handling objections, or difficult conversations
- "teach-ai": Learner explains a concept, framework, or set of principles to an AI playing a naive learner — excellent for consolidating knowledge of content already covered in the slides
- "thought-partner": Open coaching conversation to help the learner apply an idea to their own work context
- "two-way-conversation": Two real people record a conversation (mock interview, role play with a partner) — AI transcribes and gives feedback
- "doc-critique": Learner reads a SEPARATE external document (e.g. a case study, contract, report, or business plan that is not part of the slide deck) and shares observations — AI coaches on what they should have noticed. ONLY use this type when the slides explicitly reference an external document for participants to analyse. NEVER suggest it for principles, frameworks, theory, or content that is itself explained in the slides — use "chat" or "teach-ai" for those instead.
- "task-walkthrough": Learner describes their progress on a task via voice — AI coaches them through completion

Return ONLY a valid JSON array, no other text. Each item:
{
  "type": one of the types above,
  "title": compelling activity title, max 8 words,
  "description": 1-2 sentences — what participants do and what they get out of it,
  "slideReference": which slides this relates to (e.g. "Slides 4–6") — always include this,
  "slideStartIndex": the first slide number this activity relates to (integer, for ordering),
  "systemPrompt": detailed, specific system prompt for the AI in this activity — reference the actual content from the slides,
  "feedbackCriteria": specific criteria for evaluating the participant's response,
  "userInstructions": brief friendly instructions shown to the participant (1-2 sentences)
}

Ground every activity specifically in the slide content — never generic.`,
          },
          {
            role: 'user',
            content: `Slide deck: "${fileName || url || 'uploaded presentation'}" (${slideCount ? `${slideCount} slides` : 'slide count unknown'})\n\nContent:\n${slideText.slice(0, 15000)}\n\nSuggest activities scaled to the deck length, in slide order.`,
          },
        ],
        temperature: 0.7,
      });

      const raw = (completion.choices[0].message.content || '[]')
        .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      let suggestions: any[] = [];
      try { suggestions = JSON.parse(raw); } catch { suggestions = []; }
      suggestions = suggestions
        .sort((a: any, b: any) => (a.slideStartIndex ?? 999) - (b.slideStartIndex ?? 999))
        .map((s: any) => { const { slideStartIndex, ...rest } = s; return { ...rest, id: crypto.randomUUID() }; });

      res.json({ suggestions, slideCount, slideContext: slideText });
    } catch (error: any) {
      console.error('Error suggesting activities:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/build-suggestion", requireAuth, async (req: Request, res: Response) => {
    try {
      const { suggestion, slideContext } = req.body;
      if (!suggestion) return res.status(400).json({ error: 'suggestion is required' });

      const typeDescriptions: Record<string, string> = {
        chat: 'a role-play conversation where the learner talks with an AI playing a specific character or role',
        'teach-ai': 'a "teach an AI" exercise where the learner explains a concept to an AI playing a naive learner',
        'thought-partner': 'an open coaching conversation where the AI helps the learner apply an idea to their own work context',
        'two-way-conversation': 'a recorded conversation between two real people that is transcribed and given feedback',
        'doc-critique': 'the learner reads a document and submits their observations, which the AI evaluates',
        'task-walkthrough': 'the learner talks through their progress on a task and the AI coaches them through completion via voice',
      };

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an expert learning designer creating a detailed, production-ready learning activity configuration for an apprenticeship training platform.

The activity type is: ${typeDescriptions[suggestion.type] || suggestion.type}

You will be given a suggested activity and the actual slide content it relates to. Your job is to write rich, highly specific configuration fields that a trainer could use immediately without editing.

Return ONLY valid JSON with these fields:
{
  "systemPrompt": "Detailed AI instructions (250-400 words). Be specific: reference exact concepts, frameworks, terminology and scenarios from the slide content. Include how the AI should behave, what it should probe for, what good looks like, and what common mistakes to address.",
  "feedbackCriteria": "Specific evaluation rubric (150-250 words). List 4-6 concrete things to look for with clear indicators of what good/adequate/missing looks like. Reference the specific content from the slides.",
  "userInstructions": "Clear, friendly participant-facing instructions (2-4 sentences). Tell them exactly what to do and what to aim for. Make it feel achievable."
}`,
          },
          {
            role: 'user',
            content: `Activity to build:
Title: ${suggestion.title}
Type: ${suggestion.type}
Description: ${suggestion.description}
Slide reference: ${suggestion.slideReference || 'not specified'}

Relevant slide content:
${(slideContext || '').slice(0, 12000)}

Write detailed, specific configuration for this activity.`,
          },
        ],
        temperature: 0.6,
      });

      const raw = (completion.choices[0].message.content || '{}')
        .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      let detailed: any = {};
      try { detailed = JSON.parse(raw); } catch { detailed = {}; }

      res.json({
        title: suggestion.title,
        type: suggestion.type,
        systemPrompt: detailed.systemPrompt || suggestion.systemPrompt || '',
        feedbackCriteria: detailed.feedbackCriteria || suggestion.feedbackCriteria || '',
        userInstructions: detailed.userInstructions || suggestion.userInstructions || '',
      });
    } catch (error: any) {
      console.error('Error building suggestion:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/realtime/session", async (req: Request, res: Response) => {
    try {
      const { configId } = req.body;
      if (!configId) return res.status(400).json({ error: "configId is required" });

      const [config] = await db.select().from(chatConfigs).where(eq(chatConfigs.id, configId));
      if (!config) return res.status(404).json({ error: "Config not found" });

      const sessionRes = await fetch("https://api.openai.com/v1/realtime/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-realtime-preview-2024-12-17",
          instructions: config.systemPrompt,
          voice: "alloy",
        }),
      });

      if (!sessionRes.ok) {
        const err = await sessionRes.text();
        throw new Error(`OpenAI session error: ${err}`);
      }

      const data = await sessionRes.json();
      res.json({ ...data, systemPrompt: config.systemPrompt });
    } catch (error: any) {
      console.error("Error creating realtime session:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/gemini-live/session", async (req: Request, res: Response) => {
    try {
      const { configId } = req.body;
      if (!configId) return res.status(400).json({ error: "configId is required" });

      const [config] = await db.select().from(chatConfigs).where(eq(chatConfigs.id, configId));
      if (!config) return res.status(404).json({ error: "Config not found" });

      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

      res.json({
        apiKey: geminiApiKey,
        systemPrompt: config.systemPrompt,
        model: "gemini-3.1-flash-live-preview",
      });
    } catch (error: any) {
      console.error("Error creating Gemini Live session:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/thought-partner/summary", async (req: Request, res: Response) => {
    try {
      const { messages, userInstructions, feedbackCriteria, configId, sessionId } = req.body;

      let allMessages = messages || [];
      let sessionCount = 1;

      // If configId provided, aggregate all stored conversations for this GPT
      if (configId) {
        const storedConversations = await db.query.conversations.findMany({
          where: eq(conversations.configId, parseInt(configId)),
          orderBy: [conversations.createdAt],
        });

        if (storedConversations.length > 0) {
          // Combine all messages from all sessions, adding session breaks
          const combined: any[] = [];
          storedConversations.forEach((conv, idx) => {
            if (idx > 0) combined.push({ role: 'system-divider', sessionNumber: idx + 1 });
            combined.push(...(conv.messages || []));
          });
          // Merge with any unsaved messages from current session
          const storedIds = new Set(storedConversations.flatMap(c => (c.messages || []).map((m: any) => m.id)));
          const unsavedCurrentMessages = allMessages.filter((m: any) => !storedIds.has(m.id));
          if (unsavedCurrentMessages.length > 0) {
            if (combined.length > 0) combined.push({ role: 'system-divider', sessionNumber: storedConversations.length + 1 });
            combined.push(...unsavedCurrentMessages);
          }
          allMessages = combined;
          sessionCount = storedConversations.length + (unsavedCurrentMessages.length > 0 ? 1 : 0);
          sessionCount = Math.max(sessionCount, storedConversations.length);
        }
      }

      const conversationMessages = allMessages.filter((m: any) => m.role !== 'system-divider');
      if (conversationMessages.length === 0) {
        return res.status(400).json({ error: "No conversation to summarise" });
      }

      let transcript = '';
      let currentSession = 1;
      allMessages.forEach((m: any) => {
        if (m.role === 'system-divider') {
          transcript += `\n--- Conversation ${m.sessionNumber} ---\n`;
          currentSession = m.sessionNumber;
        } else {
          const speaker = m.role === 'user' ? 'Learner' : 'Thought Partner';
          const text = typeof m.content === 'string' ? m.content : m.content?.text || '';
          transcript += `${speaker}: ${text}\n`;
        }
      });

      const summaryFocus = feedbackCriteria
        ? `Pay particular attention to: ${feedbackCriteria}`
        : '';

      const prompt = `You are analysing ${sessionCount > 1 ? `${sessionCount} thought partner conversations` : 'a thought partner conversation'} about the following topic: "${userInstructions || 'a topic'}".

${summaryFocus}

Here is the conversation transcript:
${transcript}

Create a structured thinking map covering all conversations. Return valid JSON in exactly this format:
{
  "keyThemes": ["theme 1", "theme 2", "theme 3"],
  "insights": ["insight 1", "insight 2", "insight 3"],
  "openQuestions": ["question still to explore 1", "question 2"],
  "nextSteps": ["suggested next step 1", "suggested next step 2", "suggested next step 3"]
}

Guidelines:
- keyThemes: the main concepts and areas explored across all conversations (3-5 items)
- insights: concrete realisations or positions the learner reached (2-4 items)
- openQuestions: threads that came up but weren't fully resolved (2-3 items)
- nextSteps: practical actions or further thinking the learner could do (2-4 items)
Return only the JSON object, no other text.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 800,
        temperature: 0.4,
      });

      const raw = response.choices[0]?.message?.content || '{}';
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const summary = JSON.parse(cleaned);

      // Save a concise per-conversation summary so the admin view can show it
      if (sessionId && configId) {
        try {
          const parsedConfigId = parseInt(String(configId));
          const summaryBullets: string[] = [
            ...(summary.insights || []).slice(0, 2),
            ...(summary.keyThemes || []).slice(0, 2),
          ].slice(0, 4);

          const feedbackPayload = { bullets: summaryBullets, score: null, summary: null };

          // Upsert: update if exists, insert if not
          await db
            .insert(conversations)
            .values({
              configId: parsedConfigId,
              sessionId: String(sessionId),
              messages: [],
              feedback: feedbackPayload as any,
            })
            .onConflictDoUpdate({
              target: [conversations.configId, conversations.sessionId],
              set: { feedback: feedbackPayload as any },
            });
        } catch (saveErr) {
          console.error("Failed to save thought-partner summary to conversation:", saveErr);
        }
      }

      res.json({ ...summary, sessionCount });
    } catch (error: any) {
      console.error("Error generating thought partner summary:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/chat-hint", async (req: Request, res: Response) => {
    try {
      const { feedbackCriteria, userInstructions, messages } = req.body;

      if (!feedbackCriteria) {
        return res.status(400).json({ error: "Feedback criteria is required" });
      }

      const prompt = `Based on these criteria:\n${feedbackCriteria}\n\nAnd these instructions:\n${userInstructions || 'No specific instructions'}\n\nAnalyze the current conversation and provide a helpful hint for the user to improve their responses. Keep the hint concise and specific. \nWrite the hint straight out - don't include "Hint:" at the beginning of your response.\n Limit the response to 2 sentences.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert at providing constructive hints and guidance. Keep your hints brief, specific, and actionable."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_completion_tokens: 2000,
      });

      const hint = completion.choices[0]?.message?.content;
      if (!hint) {
        throw new Error("Failed to generate hint");
      }

      res.json({ message: hint });
    } catch (error: any) {
      console.error("Error generating hint:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Messages endpoints
  app.get("/api/messages", async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.query.configId as string);
      const sessionId = req.query.sessionId as string || crypto.randomUUID();
      const userName = req.query.userName ? decodeURIComponent(String(req.query.userName)) : null;
      console.log("Received userName:", userName);

      if (isNaN(configId)) {
        return res.status(400).json({ error: "Valid config ID is required" });
      }

      const conversation = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.configId, configId),
          eq(conversations.sessionId, sessionId)
        ),
      });

      if (!messageSessions[sessionId]) {
        messageSessions[sessionId] = conversation?.messages || [];
      }

      res.json({
        messages: messageSessions[sessionId],
        isLoading: false,
        error: null
      });
    } catch (error: any) {
      console.error("Error fetching messages:", error);
      res.status(500).json({
        messages: [],
        isLoading: false,
        error: "Failed to fetch messages"
      });
    }
  });

  app.post("/api/messages", async (req: Request, res: Response) => {
    try {
      const { content, config: configData } = req.body;
      const configId = parseInt(req.query.configId as string);
      const sessionId = req.query.sessionId as string || crypto.randomUUID();
      const userName = req.query.userName as string || null;
      const chatMode = (req.query.chatMode as string) || 'typed';

      if (!content) {
        return res.status(400).json({ error: "Message content is required" });
      }

      if (isNaN(configId)) {
        return res.status(400).json({ error: "Valid config ID is required" });
      }

      const parsedConfig = configSchema.parse(configData);

      if (!messageSessions[sessionId]) {
        const existingConversation = await db.query.conversations.findFirst({
          where: and(
            eq(conversations.configId, configId),
            eq(conversations.sessionId, sessionId)
          ),
        });
        messageSessions[sessionId] = existingConversation?.messages || [];
      }

      const userMessage: Message = {
        id: crypto.randomUUID(),
        content: typeof content === 'string' ? content : {
          text: content.text,
          image: content.image
        },
        role: 'user',
        timestamp: Date.now(),
        sessionId
      };
      messageSessions[sessionId].push(userMessage);

      try {
        await db
          .insert(conversations)
          .values({
            configId,
            sessionId,
            userName,
            chatMode,
            messages: messageSessions[sessionId],
          })
          .onConflictDoUpdate({
            target: [conversations.configId, conversations.sessionId],
            set: {
              messages: messageSessions[sessionId]
            }
          });
      } catch (error) {
        console.error("Error saving conversation:", error);
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const enhancedSystemPrompt = `${parsedConfig.systemPrompt}\n\nIMPORTANT INSTRUCTION: The user's name is "${userName || 'Anonymous'}". You must follow these rules:\n1. Your VERY FIRST WORDS must be a greeting with their name (e.g. "Hello ${userName || 'Anonymous'}!" or "Hi ${userName || 'Anonymous'}!")\n2. Never skip the name in the initial greeting\n3. Don't use the name too much!`;

      const apiMessages: ChatCompletionMessageParam[] = [
        { role: "system", content: enhancedSystemPrompt }
      ];

      // For thought-partner: inject reference images as context before conversation
      if (parsedConfig.type === 'thought-partner' && parsedConfig.referenceImages?.length) {
        const imageContent: any[] = [
          { type: 'text', text: 'Here is my reference material for this session:' },
          ...parsedConfig.referenceImages.map(img => ({
            type: 'image_url',
            image_url: { url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}` }
          }))
        ];
        apiMessages.push({ role: 'user', content: imageContent });
        apiMessages.push({ role: 'assistant', content: "Thank you — I have your reference material. I'll use it to inform our conversation." });
      }

      for (const m of messageSessions[sessionId]) {
        if (typeof m.content === 'string') {
          apiMessages.push({
            role: m.role,
            content: m.content
          });
        } else if (!m.content.image) {
          apiMessages.push({
            role: m.role,
            content: m.content.text
          });
        } else {
          apiMessages.push({
            role: m.role,
            content: [
              {
                type: "text",
                text: m.content.text || "Please analyze this image."
              },
              {
                type: "image_url",
                image_url: {
                  url: m.content.image
                }
              }
            ]
          });
        }
      }

      let accumulatedMessage = '';
      const messageId = crypto.randomUUID();

      try {
        const stream = await openai.chat.completions.create({
          model: "gpt-5.4-mini",
          messages: apiMessages,
          temperature: parsedConfig.temperature,
          max_completion_tokens: parsedConfig.maxTokens,
          stream: true,
        });

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            accumulatedMessage += content;
            res.write(`data: ${JSON.stringify({ content, messageId })}\n\n`);
          }
        }

        const assistantMessage: Message = {
          id: messageId,
          content: accumulatedMessage,
          role: 'assistant',
          timestamp: Date.now(),
          sessionId
        };
        messageSessions[sessionId].push(assistantMessage);

        await db
          .update(conversations)
          .set({
            messages: messageSessions[sessionId]
          })
          .where(and(
            eq(conversations.configId, configId),
            eq(conversations.sessionId, sessionId)
          ));

        res.write('data: [DONE]\n\n');
        res.end();
      } catch (streamError) {
        console.error("Stream error:", streamError);
        res.write(`data: ${JSON.stringify({ error: "Error processing request" })}\n\n`);
        res.end();
      }
    } catch (error: any) {
      console.error("Error processing message:", error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  });

  app.post("/api/upload-feedback", async (req: Request, res: Response) => {
    try {
      const { configId, sessionId, fileContent, fileName, userName } = uploadFeedbackSchema.parse(req.body);

      const config = await db.query.chatConfigs.findFirst({
        where: eq(chatConfigs.id, configId),
      });

      if (!config) {
        return res.status(404).json({ error: "Configuration not found" });
      }

      if (!config.feedbackCriteria) {
        return res.status(400).json({ error: "Feedback criteria not set for this configuration" });
      }

      const prompt = `Context:\n${config.systemPrompt}\n\nAnalyze the uploaded screenshot based on these criteria:\n${config.feedbackCriteria}\n\nAddress the user as 'you' in your response (and do not just say 'the user').\n\nPlease provide your analysis in exactly this format, ensuring you are evaluating the user's side of the conversation (i.e. the person who first types, NOT the GPT (which is you as the bot):\n\n• [3 bullet points focusing on how well the screenshot meets the criteria. Keep each bullet to 1 sentence]\n\nScore: [1-10]\n[Brief one-line summary of overall quality]`;

      const completion = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert at analyzing screenshots and providing constructive feedback. Focus on visual elements, clarity, and how well the content meets the specified criteria."
          },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: fileContent }
              }
            ]
          }
        ],
        max_completion_tokens: 5000,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error("Failed to get response from OpenAI");
      }

      const scoreMatch = response.match(/Score:\s*(\d+)/i);
      const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;

      const summaryMatch = response.match(/Score:\s*\d+\s*\n([^\n]+)/i);
      const summary = summaryMatch ? summaryMatch[1].trim() : null;

      const bullets = response
        .split(/Score:/i)[0]
        .split(/[•\-\*]\s+/)
        .filter(bullet => bullet.trim())
        .map(bullet => bullet.trim());

      const feedbackData: UploadFeedback = {
        bullets,
        score,
        summary
      };

      await db
        .insert(uploads)
        .values({
          configId,
          sessionId,
          userName,
          fileName,
          feedback: feedbackData
        })
        .onConflictDoUpdate({
          target: [uploads.configId, uploads.sessionId],
          set: {
            userName,
            fileName,
            feedback: feedbackData
          }
        });

      res.json(feedbackData);
    } catch (error: any) {
      console.error("Error processing upload feedback:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update the quiz feedback endpoint to use quiz_responses table
  // Remove auth for public quiz feedback
  app.post("/api/quiz-feedback", async (req: Request, res: Response) => {
    try {
      const { configId, sessionId, userName, questions, answers } = quizSubmissionSchema.parse(req.body);


      const feedbackPromises = answers.map(async ({ questionIndex, answer, expectedAnswer }) => {
        const prompt = `Use the information in the 'expected' answer field to categorize it as either 'correct' (if it matches closely), 'almost' (if it's on the right track but not quite there), or 'incorrect' (if it's way off). You should not directly compare to the expected answer, but use the information to inform your assessment. For example if the expected answer includes 'Any one of the following answers' you are not looking for that exact text in the answer, you are using that as instructions on how to assess the answer.  If in doubt, be generous in your assessment. Don't assume that more detail is necessarily more correct however.
        
        Here are some examples of how to assess answers:

        Example 1:
        Question: What is the capital of France?
        Expected Answer: Paris
        User's Answer: paris
        Assessment: "correct" (The answer is correct despite   capitalization differences)

        Example 2:
        Question: Name two primary colors.
        Expected Answer: Any two of: red, blue, yellow
        User's Answer: Red and Blue 
        Assessment: "correct" (The answer contains two correct primary colors)

        Example 3:
        Question: What programming language is commonly used for web development?
        Expected Answer: Any of: JavaScript, Python, PHP, Ruby, Java
        User's Answer: C++
        Assessment: "incorrect" (While C++ can be used for web development, it's not commonly used compared to the expected answers)

        Example 4:
        Question: What’s the difference between OKRs and KPIs?
        Expected Answer: OKR's are timebound and aimed at achieving an objective whereas KPIs are measuring the health of the business or product over time (even if you're not doing any specific work to change the KPI at any point)
        User's Answer: OKRs are targets to be hit (often a single time bound target that can be achieved) - e.g. "launch a website by February" or "reach 1 million users by June" KPIs are longer term performance related targets - e.g. maintain 98% up-time
        Assessment: "correct" (For longer answers like this one, if the user has the general gist then mark as correct)
        
        Now assess the user's answer:
        Question: ${questions[questionIndex].question}
        Expected Answer: ${expectedAnswer}
        User's Answer: ${answer}
        
        Respond in exactly this format:
        {
          "status": "correct|almost|incorrect",
          "feedback": "Brief, constructive feedback explaining why"
        }`;

        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-5.4-mini",
            messages: [
              {
                role: "system",
                content: "You are an expert at evaluating quiz answers. Be fair but strict in your evaluations. Provide constructive feedback that helps the user understand why their answer was correct or what they could improve."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            temperature: 0.3
          });

          if (!completion.choices[0]?.message?.content) {
            throw new Error("No response from OpenAI");
          }

          try {
            const feedback = JSON.parse(completion.choices[0].message.content);
            return {
              ...feedback,
              answer // Store the user's actual answer
            };
          } catch (parseError) {
            console.error("Error parsing OpenAI response:", parseError);
            return {
              status: "error",
              feedback: "Failed to evaluate answer. Please try again.",
              answer // Store the user's actual answer even if evaluation fails
            };
          }
        } catch (error) {
          console.error("Error processing answer feedback:", error);
          return {
            status: "error",
            feedback: "Failed to evaluate answer. Please try again.",
            answer // Store the user's actual answer even if API call fails
          };
        }
      });

      const feedbackResults = await Promise.all(feedbackPromises);
      const feedbackMap: Record<number, typeof feedbackResults[0]> = {};

      answers.forEach(({ questionIndex }, index) => {
        feedbackMap[questionIndex] = feedbackResults[index];
      });

      // Save the quiz response to the database using the updated schema
      try {
        const insertData = {
          configId,
          sessionId,
          userName: userName || null,
          feedback: feedbackMap,
          createdAt: new Date()
        };

        const result = await db.insert(quizResponses).values(insertData)
          .onConflictDoUpdate({
            target: [quizResponses.configId, quizResponses.sessionId],
            set: {
              feedback: feedbackMap,
              userName: userName || null
            }
          })
          .returning();

      } catch (dbError) {
        console.error("Error saving quiz response to database:", dbError);
        throw dbError;
      }

      res.json(feedbackMap);
    } catch (error: any) {
      console.error("Error processing quiz feedback:", error);
      res.status(500).json({
        error: error.message || "Failed to process quiz submission",
        details: error.errors || error.stack
      });
    }
  });

  // Add new endpoint for fetching quiz responses after the existing quiz feedback endpoint
  app.get("/api/quiz-responses/:configId", async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.configId);

      if (isNaN(configId)) {
        return res.status(400).json({ error: "Invalid config ID" });
      }

      // Fetch all responses for this quiz
      const responses = await db.query.quizResponses.findMany({
        where: eq(quizResponses.configId, configId),
        orderBy: [desc(quizResponses.createdAt)]
      });

      // Format the response data
      const formattedResponses = responses.map(response => ({
        sessionId: response.sessionId,
        userName: response.userName,
        feedback: response.feedback
      }));

      res.json(formattedResponses);
    } catch (error: any) {
      console.error("Error fetching quiz responses:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Quick Fire Quiz Endpoints ────────────────────────────────────────────

  app.post("/api/quick-fire-quiz/:configId/join", async (req: Request, res: Response) => {
    const configId = parseInt(req.params.configId);
    if (isNaN(configId)) return res.status(400).json({ error: "Invalid configId" });
    const { participantId } = req.body;
    if (!participantId) return res.status(400).json({ error: "Missing participantId" });
    if (!quizParticipants.has(configId)) quizParticipants.set(configId, new Map());
    quizParticipants.get(configId)!.set(participantId, Date.now());
    res.json({ ok: true });
  });

  app.get("/api/quick-fire-quiz/:configId/state", async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.configId);
      if (isNaN(configId)) return res.status(400).json({ error: "Invalid configId" });

      let stateRows = await db.query.quickFireQuizState.findFirst({
        where: eq(quickFireQuizState.configId, configId),
      });

      if (!stateRows) {
        const inserted = await db.insert(quickFireQuizState)
          .values({ configId, phase: 'waiting', currentQuestionIndex: -1 })
          .returning();
        stateRows = inserted[0];
      }

      let state = stateRows;

      // Fetch all questions for totalQuestions count
      const allQuestions = await db.query.quickFireQuizQuestions.findMany({
        where: eq(quickFireQuizQuestions.configId, configId),
        orderBy: [quickFireQuizQuestions.orderIndex],
      });

      // Auto-transition question → results when timer expires
      if (state.phase === 'question' && state.questionStartedAt && state.currentQuestionIndex >= 0) {
        const currentQ = allQuestions[state.currentQuestionIndex];
        if (currentQ) {
          const elapsed = Date.now() - new Date(state.questionStartedAt).getTime();
          if (elapsed >= currentQ.timeLimit * 1000) {
            await db.update(quickFireQuizState)
              .set({ phase: 'results', updatedAt: new Date() })
              .where(eq(quickFireQuizState.configId, configId));
            state = { ...state, phase: 'results' };
          }
        }
      }

      let currentQuestion = null;
      let answeredCount = 0;
      if (state.currentQuestionIndex >= 0) {
        const q = allQuestions[state.currentQuestionIndex];
        if (q) {
          currentQuestion = {
            id: q.id,
            question: q.question,
            options: q.options,
            timeLimit: q.timeLimit,
            orderIndex: q.orderIndex,
            ...(state.phase !== 'question' ? { correctIndex: q.correctIndex } : {}),
          };
          const countResult = await db.select({ value: count() })
            .from(quickFireQuizResponses)
            .where(and(
              eq(quickFireQuizResponses.configId, configId),
              eq(quickFireQuizResponses.questionId, q.id),
            ));
          answeredCount = countResult[0]?.value ?? 0;
        }
      }

      res.json({
        phase: state.phase,
        currentQuestionIndex: state.currentQuestionIndex,
        questionStartedAt: state.questionStartedAt,
        totalQuestions: allQuestions.length,
        participantCount: getActiveParticipants(configId),
        answeredCount,
        currentQuestion,
        ...(state.phase === 'finished' ? {
          allQuestions: allQuestions.map(q => ({
            id: q.id,
            question: q.question,
            options: q.options,
            correctIndex: q.correctIndex,
            orderIndex: q.orderIndex,
          })),
        } : {}),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/quick-fire-quiz/:configId/answer", async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.configId);
      const { questionId, participantId, userName, selectedIndex, responseTimeMs } = req.body;

      if (!questionId || !participantId || selectedIndex === undefined || responseTimeMs === undefined) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const question = await db.query.quickFireQuizQuestions.findFirst({
        where: eq(quickFireQuizQuestions.id, questionId),
      });
      if (!question) return res.status(404).json({ error: "Question not found" });

      const isCorrect = selectedIndex === question.correctIndex;
      const timeLimitMs = question.timeLimit * 1000;
      const points = isCorrect
        ? Math.max(50, Math.round(1000 * (1 - Math.min(responseTimeMs, timeLimitMs) / timeLimitMs)))
        : 0;

      await db.insert(quickFireQuizResponses).values({
        configId,
        questionId,
        participantId,
        userName: userName || null,
        selectedIndex,
        responseTimeMs,
        points,
      }).onConflictDoNothing();

      res.json({ points, correct: isCorrect });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/quick-fire-quiz/:configId/leaderboard", async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.configId);
      const participantId = req.query.participantId as string | undefined;

      if (isNaN(configId)) return res.status(400).json({ error: "Invalid configId" });

      const result = await pool.query<{ participant_id: string; user_name: string | null; total_points: string }>(
        `SELECT participant_id, user_name, SUM(points) AS total_points
         FROM quick_fire_quiz_responses
         WHERE config_id = $1
         GROUP BY participant_id, user_name
         ORDER BY total_points DESC`,
        [configId]
      );

      const entries = result.rows.map((row, index) => ({
        participantId: row.participant_id,
        userName: row.user_name || 'Anonymous',
        totalPoints: parseInt(row.total_points),
        rank: index + 1,
        isCurrentUser: !!(participantId && row.participant_id === participantId),
      }));

      const currentUserRank = participantId
        ? entries.find(e => e.isCurrentUser)?.rank
        : undefined;

      res.json({ entries, currentUserRank });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/quick-fire-quiz/:configId/start", requireAuth, async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.configId);
      if (isNaN(configId)) return res.status(400).json({ error: "Invalid configId" });

      await db.insert(quickFireQuizState)
        .values({ configId, phase: 'question', currentQuestionIndex: 0, questionStartedAt: new Date(), updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [quickFireQuizState.configId],
          set: { phase: 'question', currentQuestionIndex: 0, questionStartedAt: new Date(), updatedAt: new Date() },
        });

      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/quick-fire-quiz/:configId/next", requireAuth, async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.configId);
      if (isNaN(configId)) return res.status(400).json({ error: "Invalid configId" });

      const state = await db.query.quickFireQuizState.findFirst({
        where: eq(quickFireQuizState.configId, configId),
      });
      if (!state) return res.status(404).json({ error: "State not found" });

      if (state.phase === 'question') {
        await db.update(quickFireQuizState)
          .set({ phase: 'results', updatedAt: new Date() })
          .where(eq(quickFireQuizState.configId, configId));
        return res.json({ phase: 'results', currentQuestionIndex: state.currentQuestionIndex });
      }

      if (state.phase === 'results') {
        const totalQuestions = await db.query.quickFireQuizQuestions.findMany({
          where: eq(quickFireQuizQuestions.configId, configId),
        });
        const nextIndex = state.currentQuestionIndex + 1;
        if (nextIndex >= totalQuestions.length) {
          await db.update(quickFireQuizState)
            .set({ phase: 'finished', updatedAt: new Date() })
            .where(eq(quickFireQuizState.configId, configId));
          return res.json({ phase: 'finished' });
        }
        await db.update(quickFireQuizState)
          .set({ phase: 'question', currentQuestionIndex: nextIndex, questionStartedAt: new Date(), updatedAt: new Date() })
          .where(eq(quickFireQuizState.configId, configId));
        return res.json({ phase: 'question', currentQuestionIndex: nextIndex });
      }

      res.json({ phase: state.phase });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/quick-fire-quiz/:configId/reset", requireAuth, async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.configId);
      if (isNaN(configId)) return res.status(400).json({ error: "Invalid configId" });

      await db.update(quickFireQuizState)
        .set({ phase: 'waiting', currentQuestionIndex: -1, questionStartedAt: null, updatedAt: new Date() })
        .where(eq(quickFireQuizState.configId, configId));
      await db.delete(quickFireQuizResponses).where(eq(quickFireQuizResponses.configId, configId));
      quizParticipants.delete(configId);

      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Activity timers ───────────────────────────────────────────────────────

  app.get("/api/timer/:configId", async (req: Request, res: Response) => {
    const configId = parseInt(req.params.configId);
    if (isNaN(configId)) return res.status(400).json({ error: "Invalid configId" });
    const t = activityTimers.get(configId);
    if (!t) return res.json({ status: 'idle', totalSeconds: 0, remainingSeconds: 0 });
    const remaining = getTimerRemaining(t);
    // Auto-finish if running and reached 0
    if (t.status === 'running' && remaining <= 0) {
      activityTimers.set(configId, { ...t, status: 'finished', remainingAtLastAction: 0, startedAt: null });
    }
    res.json({ status: remaining <= 0 && t.status === 'running' ? 'finished' : t.status, totalSeconds: t.totalSeconds, remainingSeconds: Math.round(remaining * 10) / 10 });
  });

  app.post("/api/timer/:configId", requireAuth, async (req: Request, res: Response) => {
    const configId = parseInt(req.params.configId);
    if (isNaN(configId)) return res.status(400).json({ error: "Invalid configId" });
    const { action, seconds } = req.body as { action: string; seconds?: number };
    let t = activityTimers.get(configId) ?? { totalSeconds: 0, remainingAtLastAction: 0, startedAt: null, status: 'idle' as const };

    if (action === 'set') {
      const secs = Math.max(0, seconds ?? 0);
      t = { totalSeconds: secs, remainingAtLastAction: secs, startedAt: null, status: 'idle' };
    } else if (action === 'add') {
      const add = seconds ?? 60;
      const current = getTimerRemaining(t);
      const newRemaining = current + add;
      const newTotal = t.totalSeconds + add;
      t = { ...t, totalSeconds: newTotal, remainingAtLastAction: newRemaining, startedAt: t.status === 'running' ? Date.now() : t.startedAt };
      if (t.status === 'running') t = { ...t, remainingAtLastAction: newRemaining, startedAt: Date.now() };
    } else if (action === 'start') {
      t = { ...t, startedAt: Date.now(), status: 'running' };
    } else if (action === 'pause') {
      const remaining = getTimerRemaining(t);
      t = { ...t, remainingAtLastAction: remaining, startedAt: null, status: 'paused' };
    } else if (action === 'resume') {
      t = { ...t, startedAt: Date.now(), status: 'running' };
    } else if (action === 'stop') {
      t = { totalSeconds: t.totalSeconds, remainingAtLastAction: t.totalSeconds, startedAt: null, status: 'idle' };
    } else if (action === 'reset') {
      activityTimers.delete(configId);
      return res.json({ status: 'idle', totalSeconds: 0, remainingSeconds: 0 });
    }

    activityTimers.set(configId, t);
    const remaining = getTimerRemaining(t);
    res.json({ status: t.status, totalSeconds: t.totalSeconds, remainingSeconds: Math.round(remaining * 10) / 10 });
  });

  app.post("/api/configs/generate-quick-fire-options", requireAuth, async (req: Request, res: Response) => {
    try {
      const { question } = req.body;
      if (!question?.trim()) return res.status(400).json({ error: "Question required" });

      const openai = new OpenAI();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You generate multiple choice options for quiz questions. Return a JSON object with:
- "correct": the single correct answer (concise, 2-8 words)
- "distractors": an array of exactly 3 plausible but wrong answers (same style and length as the correct answer)

Rules: all four options must be similar in length and style. Distractors should be genuinely plausible on first read. Return only valid JSON, no markdown.`
          },
          { role: "user", content: `Question: ${question}` }
        ],
        response_format: { type: "json_object" },
        temperature: 0.8,
      });

      const raw = JSON.parse(completion.choices[0].message.content!);
      res.json({ correct: raw.correct, distractors: raw.distractors });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────

  app.post("/api/chat-feedback", async (req: Request, res: Response) => {
    try {
      const { configId, sessionId, messages, userName, chatMode } = req.body;

      if (!configId || !sessionId || !messages) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      const config = await db.query.chatConfigs.findFirst({
        where: eq(chatConfigs.id, configId),
      });

      if (!config) {
        return res.status(404).json({ error: "Configuration not found" });
      }

      const isTeachAiFeedback = config.type === 'teach-ai';

      if (!isTeachAiFeedback && !config.feedbackCriteria) {
        return res.status(400).json({ error: "Feedback criteria not set for this configuration" });
      }

      const prompt = isTeachAiFeedback
        ? `You are evaluating a "Teach the AI" session. The learner was asked to explain a topic to you (the AI playing the role of a learner).

Topic and key points the learner was supposed to cover:
${config.userInstructions || 'No specific key points provided.'}

${config.feedbackCriteria ? `Additional feedback criteria:\n${config.feedbackCriteria}\n\n` : ''}Evaluate the learner's explanation against EVERY key point listed in the topic/instructions above. For each key point, assign one of:
• 🔴 Not covered — the learner did not address this point
• 🟡 Partially covered — add a brief comment saying what they got right and what was missing
• 🟢 Well covered — add a brief comment saying what they did well

IMPORTANT: Address the learner directly as 'you'. Never say 'the user' or 'they'.

Format your response EXACTLY like this (one bullet per key point):
• [Key Point Name]: 🔴 Not covered
• [Key Point Name]: 🟡 Partially covered — You touched on X but missed Y
• [Key Point Name]: 🟢 Well covered — You clearly explained Z with a strong example

Scoring standard: ${harshnessGuidance(config.feedbackHarshness)}

Score: [1-10 based on overall coverage and quality of explanation]
[One-line overall summary using 'you']`
        : `Context:\n${config.systemPrompt}\n\nAnalyze the conversation based on these criteria:\n${config.feedbackCriteria}\n\nIMPORTANT: Your analysis must focus solely on the user's contributions—DO NOT reference or evaluate any of the GPT responses (you can identify the user as the first person to contribute to the conversation, and the gpt as the second - and then they alternate of course). When giving feedback, you MUST address the person being evaluated directly as 'you' in ALL feedback points. NEVER use phrases like 'the user' or 'they' – always speak directly (e.g. "You demonstrated strong understanding" instead of "The user demonstrated strong understanding"). You should also refer to yourself as 'me' or 'I' as the GPT. For example you might say 'You did an excellent job probing for specific details about my experiences with meal planning, particularly by asking follow-up questions that encouraged me to share more about my routines and preferences.'\n\nScoring standard: ${harshnessGuidance(config.feedbackHarshness)}\n\nPlease provide your analysis in exactly this format, evaluating ONLY the user's side of the conversation:\n\n• [3 bullet points focusing on how well your contributions meet the criteria. Each bullet must use 'you' and be 1 sentence]\n\nScore: [1-10]\n[Brief one-line summary of overall quality using 'you']`;


      const conversation = messages.map((m: Message) =>
        `${m.role}: ${typeof m.content === 'string' ? m.content : m.content.text}`
      ).join('\n');

      const completion = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert at analyzing conversations and providing constructive feedback. Focus on communication effectiveness and how well the content meets the specified criteria."
          },
          {
            role: "user",
            content: `${prompt}\n\nConversation to analyze:\n${conversation}`
          }
        ],
        temperature: 0.7,
        max_completion_tokens: 5000,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error("Failed to get response from OpenAI");
      }

      const scoreMatch = response.match(/Score:\s*(\d+)/i);
      const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;

      const summaryMatch = response.match(/Score:\s*\d+\s*\n([^\n]+)/i);
      const summary = summaryMatch ? summaryMatch[1].trim() : null;

      const bullets = response
        .split(/Score:/i)[0]
        .split(/[•\-\*]\s+/)
        .filter(bullet => bullet.trim())
        .map(bullet => bullet.trim());

      const feedbackData: ConversationFeedback = {
        bullets,
        score,
        summary,
        manual: true,
      };

      await db
        .insert(conversations)
        .values({
          configId,
          sessionId,
          userName: userName || null,
          chatMode: chatMode || 'typed',
          messages: messages || [],
          feedback: feedbackData,
        })
        .onConflictDoUpdate({
          target: [conversations.configId, conversations.sessionId],
          set: { feedback: feedbackData }
        });

      res.json(feedbackData);
    } catch (error: any) {
      console.error("Error processing chat feedback:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/chat-configs/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.id);
      const userId = req.user?.id;

      if (isNaN(configId)) {
        return res.status(400).json({ error: "Invalid config ID" });
      }

      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // First check if the user owns this config
      const existingConfig = await db.query.chatConfigs.findFirst({
        where: and(
          eq(chatConfigs.id, configId),
          eq(chatConfigs.userId, userId)
        ),
      });

      if (!existingConfig) {
        return res.status(403).json({ error: "You don't have permission to delete this configuration" });
      }

      await db
        .update(chatConfigs)
        .set({ deleted: true, deletedAt: new Date() })
        .where(and(
          eq(chatConfigs.id, configId),
          eq(chatConfigs.userId, userId)
        ));

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting chat config:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/conversations/:configId", async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.configId);

      if (isNaN(configId)) {
        return res.status(400).json({ error: "Invalid config ID" });
      }

      const config = await db.query.chatConfigs.findFirst({
        where: eq(chatConfigs.id, configId),
      });

      if (!config) {
        return res.status(404).json({ error: "Configuration not found" });
      }

      if (config.type === 'upload') {
        const uploadData = await db.query.uploads.findMany({
          where: eq(uploads.configId, configId),
          orderBy: [desc(uploads.createdAt)]
        });

        const uploadsWithMetadata = uploadData.map(upload => ({
          sessionId: upload.sessionId,
          userName: upload.userName,
          fileName: upload.fileName,
          feedback: upload.feedback
        }));

        res.json(uploadsWithMetadata);
      } else {
        const conversationData = await db.query.conversations.findMany({          where: eq(conversations.configId, configId),
          orderBy: [desc(conversations.createdAt)]
        });

        const conversationsWithMetadata = conversationData.map(conv => ({
          sessionId: conv.sessionId,
          userName: conv.userName,
          chatMode: conv.chatMode,
          messages: conv.messages,
          feedback: conv.feedback
        }));

        res.json(conversationsWithMetadata);
      }
    } catch (error: any) {
      console.error("[GET /api/conversations] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });  // Fix theme analysis syntax error
  app.post("/api/analyze-themes", requireAuth, async (req: Request, res: Response) => {
    try {
      const { feedbacks } = req.body;

      if (!Array.isArray(feedbacks)) {
        return res.status(400).json({ error: "Feedbacks must be an array" });
      }

      const allBullets = feedbacks
        .flatMap((feedback: { bullets?: string[] }) => feedback.bullets || [])
        .filter(bullet => bullet);

      if (allBullets.length === 0) {
        return res.json({
          positive: "No positive themes identified yet",
          constructive: "No constructive feedback available yet"
        });
      }

      const prompt = `Analyze these feedback points and identify two key themes:

    Feedback points:
    ${allBullets.map(bullet => `-${bullet}`).join('\n')}

    Please provide exactly two themes:
    1. One positive theme highlighting what's being done well
    2. One constructive theme suggesting an area for improvement

    Format your response EXACTLY like this example:
    {
      "positive": "Participants consistently demonstrate strong engagement with the material",
      "constructive": "More emphasis is needed on practical application of concepts"
    }

    Rules:
    - Each theme should be 1-2 sentences
    - Use third-person perspective (e.g., "learners" or "users", not "you")
    - Be specific and actionable
    - Ensure the themes are framed as plural (i.e. Participants) 
    - When referring to the users, ALWAYS use'participants'
    - Base themes on patterns across multiple feedback points when possible
    - REMEMBER TO FORMAT THE RESPONSE IN JSON AS ABOVE`;

      const completion = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert at analyzing feedback and identifying key themes. Focus on patterns and provide clear, actionable insights."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_completion_tokens: 5000,
      });

      const response = completion.choices[0]?.message?.content;
      console.log(response)
      if (!response) {
        throw new Error("Failed to get response from OpenAI");
      }

      let themes;
      try {
        // First try to parse as is
        try {
          themes = JSON.parse(response);
        } catch (initialParseError) {
          // If direct parsing fails, try to extract JSON from the text response
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              themes = JSON.parse(jsonMatch[0]);
            } catch (extractedParseError) {
              console.error("Error parsing extracted JSON:", extractedParseError);
              throw new Error("Failed to parse extracted JSON");
            }
          } else {
            console.error("Error parsing OpenAI response and couldn't extract JSON:", initialParseError);
            throw new Error("Failed to parse theme analysis response");
          }
        }
      } catch (parseError) {
        console.error("Error parsing OpenAI response:", parseError);
        // Return a fallback object instead of throwing
        return {
          positive: "Error analyzing themes",
          constructive: "Error analyzing themes"
        };
      }

      res.json(themes);
    } catch (error: any) {
      console.error("Error analyzing themes:", error);
      res.status(500).json({
        error: error.message,
        positive: "Error analyzing themes",
        constructive: "Error analyzing themes"
      });
    }
  });

  app.post("/api/chat-configs/:id/template", requireAuth, async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.id);
      if (isNaN(configId)) {
        return res.status(400).json({ error: "Invalid config ID" });
      }
      const { templateDescription } = req.body;
      // Update the config to mark it as a template and ensure userId is preserved
      const updatedConfig = await db.update(chatConfigs)
        .set({
          isTemplate: true,
          templateDescription: templateDescription || null,
          referenceImages: null,  // strip reference images from templates
        })
        .where(and(
          eq(chatConfigs.id, configId),
          eq(chatConfigs.userId, req.user?.id)
        ))
        .returning();

      if (!updatedConfig.length) {
        return res.status(404).json({ error: "Configuration not found" });
      }
      res.json(updatedConfig[0]);
    } catch (error: any) {
      console.error("Error saving config as template:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  app.post("/api/chat-configs/:id/template/remove", requireAuth, async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.id);
      if (isNaN(configId)) {
        return res.status(400).json({ error: "Invalid config ID" });
      }
      
      // Update the config to remove template status
      const updatedConfig = await db.update(chatConfigs)
        .set({
          isTemplate: false,
          templateDescription: null
        })
        .where(and(
          eq(chatConfigs.id, configId),
          eq(chatConfigs.userId, req.user?.id)
        ))
        .returning();

      if (!updatedConfig.length) {
        return res.status(404).json({ error: "Configuration not found" });
      }
      res.json(updatedConfig[0]);
    } catch (error: any) {
      console.error("Error removing config from templates:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Dual Conversation Routes
  app.post("/api/dual-conversation/save", saveAudio, (error, req, res, next) => {
    if (error) {
      console.error("Multer error:", error);
      return res.status(400).json({ 
        error: "File upload error",
        message: error.message || "Failed to upload audio file"
      });
    }
    next();
  }, handleSaveAudio);
  
  app.post("/api/dual-conversation/transcribe", async (req: Request, res: Response) => {
    return transcribeAudio(req, res);
  });
  
  app.post("/api/dual-conversation/feedback", async (req: Request, res: Response) => {
    return generateFeedback(req, res);
  });
  
  app.get("/api/dual-conversations/:configId", async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.configId);
      const sessionId = req.query.sessionId as string | undefined;

      console.log(`GET /api/dual-conversations/${configId} - SessionId: ${sessionId}`);

      if (isNaN(configId)) {
        return res.status(400).json({ error: "Invalid config ID" });
      }

      // Build where clause
      let whereClause = eq(dualConversations.configId, configId);
      
      // If sessionId is provided, filter by it
      if (sessionId) {
        console.log(`Filtering by sessionId: ${sessionId}`);
        whereClause = and(
          whereClause,
          eq(dualConversations.sessionId, sessionId)
        );
      }

      // Fetch dual conversations for this config ID (and optionally sessionId)
      const conversations = await db.select({
        sessionId: dualConversations.sessionId,
        participant1Name: dualConversations.participant1Name,
        participant2Name: dualConversations.participant2Name,
        transcript: dualConversations.transcript,
        feedback: dualConversations.feedback,
        createdAt: dualConversations.createdAt
      })
      .from(dualConversations)
      .where(whereClause)
      .orderBy(desc(dualConversations.createdAt))
      .execute();
      
      // Format the response
      const formattedConversations = conversations.map(conv => ({
        sessionId: conv.sessionId,
        participant1Name: conv.participant1Name || 'Participant 1',
        participant2Name: conv.participant2Name || 'Participant 2',
        transcript: typeof conv.transcript === 'string' 
          ? JSON.parse(conv.transcript) 
          : conv.transcript,
        feedback: typeof conv.feedback === 'string'
          ? JSON.parse(conv.feedback)
          : conv.feedback,
        createdAt: conv.createdAt
      }));

      console.log(`Found ${formattedConversations.length} conversation(s) for configId: ${configId}, sessionId: ${sessionId || 'not provided'}`);
      if (formattedConversations.length === 0) {
        console.log('No conversations found with the given criteria');
      }

      res.json(formattedConversations);
    } catch (error: any) {
      console.error("[GET /api/dual-conversations] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/templates", async (req:Request, res: Response) => {
    try {
      // Only filter by isTemplate=true and deleted=false, not by userId
      // This allows all users to see all public templates
      const templates = await db.query.chatConfigs.findMany({
        where: and(
          eq(chatConfigs.isTemplate, true),
          eq(chatConfigs.deleted, false)
        ),
        orderBy: [desc(chatConfigs.createdAt)],
        with: {
          conversations: true,
          uploads: true,
          quizResponses: true,
          user: true
        }
      });

      const templatesWithCount = templates.map(template => {
        let responseCount = 0;
        if (template.type === 'upload') {
          responseCount = template.uploads?.length || 0;
        } else if (template.type === 'quiz') {
          responseCount = template.quizResponses?.length || 0;
        } else {
          responseCount = template.conversations?.length || 0;
        }

        // Include creator info while omitting sensitive data
        const creator = template.user ? {
          firstName: template.user.firstName,
          lastName: template.user.lastName
        } : null;

        return {
          id: template.id,
          title: template.title,
          type: template.type,
          systemPrompt: template.systemPrompt,
          userInstructions: template.userInstructions,
          feedbackCriteria: template.feedbackCriteria,
          createdAt: template.createdAt,
          isTemplate: true,
          templateDescription: template.templateDescription,
          conversationCount: responseCount,
          creator: creator,
          // Omit the full user object to avoid sending sensitive info
          user: undefined
        };
      });

      res.json(templatesWithCount);
    } catch (error: any) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Save transcript without grading (used by VoiceChatInterface to persist in real-time)
  app.post("/api/conversations/save-transcript", async (req: Request, res: Response) => {
    try {
      const { configId, sessionId, userName, chatMode, messages } = req.body;
      if (!configId || !sessionId || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Missing required params" });
      }
      await db
        .insert(conversations)
        .values({ configId, sessionId, userName: userName || null, chatMode: chatMode || 'spoken', messages })
        .onConflictDoUpdate({
          target: [conversations.configId, conversations.sessionId],
          set: { messages, userName: userName || null },
        });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error saving transcript:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Final leaderboard: only manually-graded entries, dynamic top N by session size
  app.get("/api/final-leaderboard/:configId", async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.configId);
      if (isNaN(configId)) return res.status(400).json({ error: "Invalid config ID" });

      const sessionId = req.query.sessionId as string | undefined;
      const userName = req.query.userName as string | undefined;

      const convData = await db.query.conversations.findMany({
        where: eq(conversations.configId, configId),
      });

      const totalParticipants = convData.length;
      const topN = totalParticipants >= 16 ? 10 : totalParticipants >= 8 ? 5 : 3;

      const allManual = withMessages
        .filter(c => c.feedback && (c.feedback as any).manual === true)
        .map(c => ({
          userName: c.userName || 'Anonymous',
          score: c.feedback!.score,
          total: 10,
          isCurrentUser: !!(userName && sessionId && c.userName === userName && c.sessionId === sessionId),
        }))
        .sort((a, b) => b.score - a.score);

      res.json({ entries: allManual, topN });
    } catch (error: any) {
      console.error("Error in final-leaderboard:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Live stats: participant count + top 3 names from already-graded conversations
  app.get("/api/live-stats/:configId", async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.configId);
      if (isNaN(configId)) return res.status(400).json({ error: "Invalid config ID" });

      const convData = await db.query.conversations.findMany({
        where: eq(conversations.configId, configId),
      });

      const participantCount = convData.length;
      const topN = participantCount >= 16 ? 10 : participantCount >= 8 ? 5 : 3;

      const leaderboard = convData
        .filter(c => c.feedback && c.feedback.score !== null)
        .sort((a, b) => (b.feedback!.score ?? 0) - (a.feedback!.score ?? 0))
        .slice(0, topN)
        .map(c => c.userName || 'Anonymous');

      res.json({ participantCount, leaderboard, topN });
    } catch (error: any) {
      console.error("Error in live-stats:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Auto-grade: grade all ungraded conversations, return updated stats
  app.post("/api/auto-grade/:configId", async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.configId);
      if (isNaN(configId)) return res.status(400).json({ error: "Invalid config ID" });

      const config = await db.query.chatConfigs.findFirst({
        where: eq(chatConfigs.id, configId),
      });

      if (!config || !config.feedbackCriteria) {
        const convData = await db.query.conversations.findMany({
          where: eq(conversations.configId, configId),
        });
        const participantCount = convData.filter(c => c.messages && c.messages.length > 0).length;
        return res.json({ participantCount, leaderboard: [] });
      }

      const convData = await db.query.conversations.findMany({
        where: eq(conversations.configId, configId),
      });

      const ungraded = convData.filter(
        c => c.messages && c.messages.length >= 2 && (!c.feedback || c.feedback.score === null)
      );

      const prompt = `Context:\n${config.systemPrompt}\n\nAnalyze the conversation based on these criteria:\n${config.feedbackCriteria}\n\nIMPORTANT: Focus only on the user's contributions. Address them directly as 'you'. Never say 'the user' or 'they'.\n\nScoring standard: ${harshnessGuidance(config.feedbackHarshness)}\n\nFormat:\n• [3 bullet points]\n\nScore: [1-10]\n[One-line summary]`;

      await Promise.all(ungraded.map(async (conv) => {
        try {
          const conversation = conv.messages.map((m: Message) =>
            `${m.role}: ${typeof m.content === 'string' ? m.content : (m.content as any).text}`
          ).join('\n');

          const completion = await openai.chat.completions.create({
            model: "gpt-5.4-mini",
            messages: [
              { role: "system", content: "You are an expert at analyzing conversations and providing constructive feedback." },
              { role: "user", content: `${prompt}\n\nConversation:\n${conversation}` }
            ],
            temperature: 0.7,
            max_completion_tokens: 2000,
          });

          const response = completion.choices[0]?.message?.content;
          if (!response) return;

          const scoreMatch = response.match(/Score:\s*(\d+)/i);
          const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;
          const summaryMatch = response.match(/Score:\s*\d+\s*\n([^\n]+)/i);
          const summary = summaryMatch ? summaryMatch[1].trim() : null;
          const bullets = response.split(/Score:/i)[0].split(/[•\-\*]\s+/).filter((b: string) => b.trim()).map((b: string) => b.trim());

          const feedbackData: ConversationFeedback = { bullets, score, summary };
          await db.update(conversations)
            .set({ feedback: feedbackData })
            .where(and(eq(conversations.configId, configId), eq(conversations.sessionId, conv.sessionId)));
        } catch (err) {
          console.error(`Error auto-grading conversation ${conv.sessionId}:`, err);
        }
      }));

      const updated = await db.query.conversations.findMany({
        where: eq(conversations.configId, configId),
      });

      const withMessages = updated.filter(c => c.messages && c.messages.length > 0);
      const participantCount = withMessages.length;
      const topN = participantCount >= 16 ? 10 : participantCount >= 8 ? 5 : 3;
      const leaderboard = withMessages
        .filter(c => c.feedback && c.feedback.score !== null)
        .sort((a, b) => (b.feedback!.score ?? 0) - (a.feedback!.score ?? 0))
        .slice(0, topN)
        .map(c => c.userName || 'Anonymous');

      res.json({ participantCount, leaderboard, topN });
    } catch (error: any) {
      console.error("Error in auto-grade:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ── Session endpoints ────────────────────────────────────────────────────

  // GET session by id with ordered configs
  app.get("/api/sessions/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const sessionId = parseInt(req.params.id);
      if (!userId || isNaN(sessionId)) return res.status(400).json({ error: "Bad request" });

      const session = await db.query.sessions.findFirst({
        where: and(eq(sessions.id, sessionId), eq(sessions.userId, userId as number)),
      });
      if (!session) return res.status(404).json({ error: "Session not found" });

      const configs = await db.query.chatConfigs.findMany({
        where: and(eq(chatConfigs.sessionId, session.id), eq(chatConfigs.deleted, false)),
        orderBy: [chatConfigs.sessionOrder],
      });

      res.json({ ...session, configs });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH rename session
  app.patch("/api/sessions/:id/title", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const sessionId = parseInt(req.params.id);
      const { title } = req.body as { title: string };
      if (!userId || isNaN(sessionId) || !title?.trim()) return res.status(400).json({ error: "Bad request" });

      await db.update(sessions)
        .set({ title: title.trim(), updatedAt: new Date() })
        .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId as number)));

      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE session and remove configs from it
  app.delete("/api/sessions/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const sessionId = parseInt(req.params.id);
      if (!userId || isNaN(sessionId)) return res.status(400).json({ error: "Bad request" });

      // Detach configs from this session
      await db.update(chatConfigs)
        .set({ sessionId: null, sessionOrder: null, isLive: false })
        .where(and(eq(chatConfigs.sessionId, sessionId), eq(chatConfigs.userId, userId as number)));

      await db.delete(sessions)
        .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId as number)));

      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST duplicate a session
  app.post("/api/sessions/:id/duplicate", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const sessionId = parseInt(req.params.id);
      if (!userId || isNaN(sessionId)) return res.status(400).json({ error: "Bad request" });

      const original = await db.query.sessions.findFirst({
        where: and(eq(sessions.id, sessionId), eq(sessions.userId, userId as number)),
      });
      if (!original) return res.status(404).json({ error: "Session not found" });

      // Create duplicate session
      const [newSession] = await db.insert(sessions).values({
        userId: userId as number,
        shareToken: crypto.randomUUID(),
        title: `${original.title} copy`,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      // Copy configs
      const originalConfigs = await db.query.chatConfigs.findMany({
        where: and(eq(chatConfigs.sessionId, sessionId), eq(chatConfigs.deleted, false)),
        orderBy: [chatConfigs.sessionOrder],
      });

      for (const cfg of originalConfigs) {
        const [newCfg] = await db.insert(chatConfigs).values({
          userId: userId as number,
          type: cfg.type,
          title: cfg.title,
          systemPrompt: cfg.systemPrompt,
          userInstructions: cfg.userInstructions,
          feedbackCriteria: cfg.feedbackCriteria,
          participant1Role: cfg.participant1Role,
          participant2Role: cfg.participant2Role,
          knowledgeLevel: cfg.knowledgeLevel,
          attitude: cfg.attitude,
          coachingStyle: cfg.coachingStyle,
          referenceContent: cfg.referenceContent,
          referenceImages: cfg.referenceImages,
          interactionMode: cfg.interactionMode,
          sessionId: newSession.id,
          sessionOrder: cfg.sessionOrder,
          isLive: cfg.isLive,
          deleted: false,
          createdAt: new Date(),
        }).returning();

        // Copy quiz questions if applicable
        if (cfg.type === 'quiz') {
          const questions = await db.query.quizQuestions.findMany({
            where: and(eq(quizQuestions.configId, cfg.id), eq(quizQuestions.deleted, false)),
            orderBy: [quizQuestions.orderIndex],
          });
          if (questions.length > 0) {
            await db.insert(quizQuestions).values(questions.map(q => ({
              configId: newCfg.id,
              question: q.question,
              expectedAnswer: q.expectedAnswer,
              orderIndex: q.orderIndex,
              createdAt: new Date(),
              deleted: false,
            })));
          }
        }
      }

      res.json({ ...newSession, configCount: originalConfigs.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH reorder configs within a session by id
  app.patch("/api/sessions/:id/order", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const sessionId = parseInt(req.params.id);
      if (!userId || isNaN(sessionId)) return res.status(400).json({ error: "Bad request" });

      const { configIds } = req.body as { configIds: number[] };
      if (!Array.isArray(configIds)) return res.status(400).json({ error: "configIds required" });

      await Promise.all(configIds.map((id, index) =>
        db.update(chatConfigs).set({ sessionOrder: index }).where(and(eq(chatConfigs.id, id), eq(chatConfigs.userId, userId as number)))
      ));
      await db.update(sessions).set({ updatedAt: new Date() }).where(eq(sessions.id, sessionId));

      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET list all sessions for the logged-in user
  app.get("/api/sessions", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const userSessions = await db.query.sessions.findMany({
        where: eq(sessions.userId, userId as number),
        orderBy: [desc(sessions.updatedAt)],
      });

      // Get config counts per session
      const sessionIds = userSessions.map(s => s.id);
      const counts: Record<number, number> = {};
      if (sessionIds.length > 0) {
        for (const sid of sessionIds) {
          const configs = await db.query.chatConfigs.findMany({
            where: and(eq(chatConfigs.sessionId, sid), eq(chatConfigs.deleted, false)),
          });
          counts[sid] = configs.length;
        }
      }

      res.json(userSessions.map(s => ({ ...s, configCount: counts[s.id] ?? 0 })));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST create a new session
  app.post("/api/sessions", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { title } = req.body as { title?: string };
      const [session] = await db.insert(sessions).values({
        userId: userId as number,
        shareToken: crypto.randomUUID(),
        title: title || "New Session",
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      res.json({ ...session, configCount: 0 });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH toggle isLive for a config
  app.patch("/api/chat-configs/:id/live", requireAuth, async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.id);
      const userId = req.user?.id;
      const { isLive } = req.body as { isLive: boolean };
      if (!userId || isNaN(configId)) return res.status(400).json({ error: "Bad request" });

      await db.update(chatConfigs)
        .set({ isLive })
        .where(and(eq(chatConfigs.id, configId), eq(chatConfigs.userId, userId)));

      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH add/remove a config from session
  app.patch("/api/chat-configs/:id/session", requireAuth, async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.id);
      const userId = req.user?.id;
      const { sessionId } = req.body as { sessionId: number | null };
      if (!userId || isNaN(configId)) return res.status(400).json({ error: "Bad request" });

      if (sessionId !== null && sessionId !== undefined) {
        // Verify session belongs to user
        const session = await db.query.sessions.findFirst({
          where: and(eq(sessions.id, sessionId), eq(sessions.userId, userId as number)),
        });
        if (!session) return res.status(404).json({ error: "Session not found" });

        const existing = await db.query.chatConfigs.findMany({
          where: and(eq(chatConfigs.sessionId, sessionId), eq(chatConfigs.deleted, false)),
        });
        const maxOrder = existing.length;
        const isFirst = maxOrder === 0;
        await db.update(chatConfigs)
          .set({ sessionId, sessionOrder: maxOrder, isLive: isFirst })
          .where(and(eq(chatConfigs.id, configId), eq(chatConfigs.userId, userId)));
        await db.update(sessions)
          .set({ updatedAt: new Date() })
          .where(eq(sessions.id, sessionId));
      } else {
        const config = await db.query.chatConfigs.findFirst({ where: eq(chatConfigs.id, configId) });
        if (config?.sessionId) {
          await db.update(sessions)
            .set({ updatedAt: new Date() })
            .where(eq(sessions.id, config.sessionId));
        }
        await db.update(chatConfigs)
          .set({ sessionId: null, sessionOrder: null, isLive: false })
          .where(and(eq(chatConfigs.id, configId), eq(chatConfigs.userId, userId)));
      }

      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET session by share token (public)
  app.get("/api/sessions/join/:token", async (req: Request, res: Response) => {
    try {
      const session = await db.query.sessions.findFirst({
        where: eq(sessions.shareToken, req.params.token),
      });
      if (!session) return res.status(404).json({ error: "Session not found" });

      const configs = await db.query.chatConfigs.findMany({
        where: and(eq(chatConfigs.sessionId, session.id), eq(chatConfigs.deleted, false)),
        orderBy: [chatConfigs.sessionOrder],
      });

      res.json({
        id: session.id,
        shareToken: session.shareToken,
        configs: configs.map(c => ({
          id: c.id,
          title: c.title,
          type: c.type,
          isLive: c.isLive,
          interactionMode: c.interactionMode,
          userInstructions: c.userInstructions,
          systemPrompt: c.systemPrompt,
          feedbackCriteria: c.feedbackCriteria,
          knowledgeLevel: c.knowledgeLevel,
          attitude: c.attitude,
          coachingStyle: c.coachingStyle,
          referenceImages: c.referenceImages,
          referenceContent: c.referenceContent,
          sessionOrder: c.sessionOrder,
          groupBoardSettings: c.groupBoardSettings,
        })),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET live status poll (public, lightweight)
  app.get("/api/sessions/join/:token/status", async (req: Request, res: Response) => {
    try {
      const session = await db.query.sessions.findFirst({
        where: eq(sessions.shareToken, req.params.token),
      });
      if (!session) return res.status(404).json({ error: "Session not found" });

      const configs = await db.query.chatConfigs.findMany({
        where: and(eq(chatConfigs.sessionId, session.id), eq(chatConfigs.deleted, false)),
        orderBy: [chatConfigs.sessionOrder],
      });

      res.json(configs.map(c => ({ configId: c.id, isLive: c.isLive ?? false })));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Group Board REST ─────────────────────────────────────────────────────────

  app.get("/api/group-board/:configId/state", async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.configId);
      if (isNaN(configId)) return res.status(400).json({ error: "Invalid configId" });
      const [postIts, comments] = await Promise.all([
        db.select().from(groupBoardPostIts).where(eq(groupBoardPostIts.configId, configId)),
        db.select().from(groupBoardComments).where(eq(groupBoardComments.configId, configId)),
      ]);
      res.json({ postIts, comments });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/group-board/:configId/postit/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const postitId = parseInt(req.params.id);
      if (isNaN(postitId)) return res.status(400).json({ error: "Invalid id" });
      await db.delete(groupBoardPostIts).where(eq(groupBoardPostIts.id, postitId));
      await broadcastBoardState(parseInt(req.params.configId));
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/group-board/:configId/comment-voice", requireAuth, async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.configId);
      const { groupNumber, audioUrl, authorName } = req.body;
      if (isNaN(configId) || !groupNumber || !audioUrl) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      await db.insert(groupBoardComments).values({
        configId,
        groupNumber: Number(groupNumber),
        type: 'voice',
        audioUrl: String(audioUrl),
        authorName: authorName || 'Trainer',
      });
      await broadcastBoardState(configId);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/group-board/:configId/comment/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const commentId = parseInt(req.params.id);
      if (isNaN(commentId)) return res.status(400).json({ error: "Invalid id" });
      await db.delete(groupBoardComments).where(eq(groupBoardComments.id, commentId));
      await broadcastBoardState(parseInt(req.params.configId));
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  registerPresentationRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}