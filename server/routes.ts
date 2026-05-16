import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db, pool } from "@db";
import { chatConfigs, conversations, uploads, quizQuestions, quizResponses, dualConversations, sessions, type Message, type ConversationFeedback, type UploadFeedback, type DualConversationFeedback } from "@db/schema";
import { eq, and, or, desc, count } from "drizzle-orm";
import { saveAudio, handleSaveAudio, transcribeAudio, generateFeedback } from "./routes/dual-conversation";
import { z } from "zod";
import crypto from 'crypto';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/dist/resources/chat/completions';

// Keep existing schema definitions...

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
  type: z.enum(['chat', 'upload', 'quiz', 'two-way-conversation', 'teach-ai', 'thought-partner']).default('chat'),
  systemPrompt: z.string().optional().default(''),
  userInstructions: z.string().nullable(),
  feedbackCriteria: z.string().nullable(),
  questions: z.array(quizQuestionSchema).optional(),
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
          }
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
        quizQuestions: undefined
      };

      res.json(responseConfig);
    } catch (error: any) {
      console.error("Error fetching chat config:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/chat-configs", requireAuth, async (req: Request, res: Response) => {
    try {
      const { title, type, systemPrompt, userInstructions, feedbackCriteria, questions, participant1Role, participant2Role, knowledgeLevel, attitude, coachingStyle, referenceContent, referenceImages, interactionMode } = chatConfigSchema.parse(req.body);

      // Get the user ID from the authenticated request
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Validate quiz type has questions
      if (type === 'quiz' && (!questions || questions.length === 0)) {
        return res.status(400).json({ error: "Quiz type requires at least one question" });
      }

      const autoGeneratedTypes = ['teach-ai', 'thought-partner'];
      if (!autoGeneratedTypes.includes(type) && !systemPrompt?.trim()) {
        return res.status(400).json({ error: "System prompt is required" });
      }

      const resolvedSystemPrompt = type === 'teach-ai'
        ? buildTeachAiSystemPrompt(userInstructions, knowledgeLevel ?? 2, attitude ?? 2)
        : type === 'thought-partner'
        ? buildThoughtPartnerSystemPrompt(userInstructions, referenceContent ?? null, coachingStyle ?? 2)
        : systemPrompt!;

      // Auto-create session for this user if one doesn't exist
      let userSession = await db.query.sessions.findFirst({
        where: eq(sessions.userId, userId as number),
        orderBy: [desc(sessions.createdAt)],
      });
      if (!userSession) {
        const [newSession] = await db.insert(sessions).values({
          userId: userId as number,
          shareToken: crypto.randomUUID(),
          createdAt: new Date(),
        }).returning();
        userSession = newSession;
      }
      const existingSessionConfigs = await db.query.chatConfigs.findMany({
        where: and(eq(chatConfigs.sessionId, userSession.id), eq(chatConfigs.deleted, false)),
      });
      const sessionConfigCount = existingSessionConfigs.length;
      const isFirstInSession = sessionConfigCount === 0;

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
        userId,
        deleted: false,
        createdAt: new Date(),
        sessionId: userSession.id,
        sessionOrder: sessionConfigCount,
        isLive: isFirstInSession,
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

      const { title, type, systemPrompt, userInstructions, feedbackCriteria, questions, participant1Role, participant2Role, knowledgeLevel, attitude, coachingStyle, referenceContent, referenceImages, interactionMode } = chatConfigSchema.parse(req.body);

      const autoGeneratedTypes = ['teach-ai', 'thought-partner'];
      if (!autoGeneratedTypes.includes(type) && !systemPrompt?.trim()) {
        return res.status(400).json({ error: "System prompt is required" });
      }

      const resolvedSystemPrompt = type === 'teach-ai'
        ? buildTeachAiSystemPrompt(userInstructions, knowledgeLevel ?? 2, attitude ?? 2)
        : type === 'thought-partner'
        ? buildThoughtPartnerSystemPrompt(userInstructions, referenceContent ?? null, coachingStyle ?? 2)
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
        })
        .where(and(
          eq(chatConfigs.id, configId),
          eq(chatConfigs.userId, userId)
        ))
        .returning();

      if (type === 'quiz') {
        // Delete existing quiz questions for this config
        await db.delete(quizQuestions).where(eq(quizQuestions.configId, configId));

        // Insert the updated list of quiz questions
        if (questions && questions.length > 0) {
          const questionsToInsert = questions.map((q, index) => ({
            configId,
            question: q.question,
            expectedAnswer: q.expectedAnswer,
            orderIndex: index,
            createdAt: new Date(),
            deleted: false
          }));
          await db.insert(quizQuestions).values(questionsToInsert);
        }
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
      };
      const typeLabel = typeDescriptions[type] || 'a conversation with an AI assistant';

      const completion = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        messages: [
          {
            role: "system",
            content: `You are helping an admin create a workplace training exercise. Based on their description, generate the configuration for ${typeLabel}.

Return a JSON object with exactly these four fields:

"title": A short, punchy title (4–7 words max).

"systemPrompt": A detailed, well-structured AI system prompt. Format it clearly using:
- A clear opening statement of the AI's role
- Numbered or bulleted sections for key behaviours and rules
- Line breaks between sections
- Plain English, no jargon
For two-way-conversation type, this prompt guides a feedback AI that analyses the conversation after it happens — write it accordingly.
For teach-ai type, leave this blank ("") — it is auto-generated.
For thought-partner type, leave this blank ("") — it is auto-generated.

"userInstructions": Instructions shown to the learner before they start. Format using:
- A short intro sentence
- A bullet list of what they need to do / key points to cover
- Any context they need about the scenario
Keep it concise and actionable.

"feedbackCriteria": The criteria the AI uses when generating feedback. Format as a numbered or bulleted list of specific, observable behaviours. Each criterion should be one clear sentence. Include 4–6 criteria.

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
      const toString = (v: any): string | null =>
        v == null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
      // Normalise field names (model sometimes returns snake_case) and flatten any nested objects
      res.json({
        title: toString(raw.title),
        systemPrompt: toString(raw.systemPrompt ?? raw.system_prompt),
        userInstructions: toString(raw.userInstructions ?? raw.user_instructions),
        feedbackCriteria: toString(raw.feedbackCriteria ?? raw.feedback_criteria),
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

Score: [1-10 based on overall coverage and quality of explanation]
[One-line overall summary using 'you']`
        : `Context:\n${config.systemPrompt}\n\nAnalyze the conversation based on these criteria:\n${config.feedbackCriteria}\n\nIMPORTANT: Your analysis must focus solely on the user's contributions—DO NOT reference or evaluate any of the GPT responses (you can identify the user as the first person to contribute to the conversation, and the gpt as the second - and then they alternate of course). When giving feedback, you MUST address the person being evaluated directly as 'you' in ALL feedback points. NEVER use phrases like 'the user' or 'they' – always speak directly (e.g. "You demonstrated strong understanding" instead of "The user demonstrated strong understanding"). You should also refer to yourself as 'me' or 'I' as the GPT. For example you might say 'You did an excellent job probing for specific details about my experiences with meal planning, particularly by asking follow-up questions that encouraged me to share more about my routines and preferences.'\n\nPlease provide your analysis in exactly this format, evaluating ONLY the user's side of the conversation:\n\n• [3 bullet points focusing on how well your contributions meet the criteria. Each bullet must use 'you' and be 1 sentence]\n\nScore: [1-10]\n[Brief one-line summary of overall quality using 'you']`;


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

      const prompt = `Context:\n${config.systemPrompt}\n\nAnalyze the conversation based on these criteria:\n${config.feedbackCriteria}\n\nIMPORTANT: Focus only on the user's contributions. Address them directly as 'you'. Never say 'the user' or 'they'.\n\nFormat:\n• [3 bullet points]\n\nScore: [1-10]\n[One-line summary]`;

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

  // GET current session with ordered configs
  app.get("/api/sessions/current", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.userId, userId as number),
        orderBy: [desc(sessions.createdAt)],
      });

      if (!session) return res.json(null);

      const configs = await db.query.chatConfigs.findMany({
        where: and(eq(chatConfigs.sessionId, session.id), eq(chatConfigs.deleted, false)),
        orderBy: [chatConfigs.sessionOrder],
      });

      res.json({ ...session, configs });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH reorder configs within session
  app.patch("/api/sessions/current/order", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { configIds } = req.body as { configIds: number[] };
      if (!Array.isArray(configIds)) return res.status(400).json({ error: "configIds required" });

      await Promise.all(
        configIds.map((id, index) =>
          db.update(chatConfigs)
            .set({ sessionOrder: index })
            .where(and(eq(chatConfigs.id, id), eq(chatConfigs.userId, userId)))
        )
      );

      res.json({ ok: true });
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
      const { inSession } = req.body as { inSession: boolean };
      if (!userId || isNaN(configId)) return res.status(400).json({ error: "Bad request" });

      if (inSession) {
        // Find or create the user's session
        let session = await db.query.sessions.findFirst({
          where: eq(sessions.userId, userId as number),
          orderBy: [desc(sessions.createdAt)],
        });
        if (!session) {
          const [newSession] = await db.insert(sessions).values({
            userId: userId as number,
            shareToken: crypto.randomUUID(),
            createdAt: new Date(),
          }).returning();
          session = newSession;
        }
        // Find current max order
        const existing = await db.query.chatConfigs.findMany({
          where: and(eq(chatConfigs.sessionId, session.id), eq(chatConfigs.deleted, false)),
        });
        const maxOrder = existing.length;
        const isFirst = maxOrder === 0;
        await db.update(chatConfigs)
          .set({ sessionId: session.id, sessionOrder: maxOrder, isLive: isFirst })
          .where(and(eq(chatConfigs.id, configId), eq(chatConfigs.userId, userId)));
      } else {
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

  const httpServer = createServer(app);
  return httpServer;
}