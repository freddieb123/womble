import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { chatConfigs, conversations, uploads, type Message, type ConversationFeedback, type UploadFeedback } from "@db/schema";
import { eq, and, or, desc, asc } from "drizzle-orm";
import { z } from "zod";
import crypto from 'crypto';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources';
import { quizQuestions, type QuizQuestion } from "@db/schema";

const uploadFeedbackSchema = z.object({
  configId: z.number(),
  sessionId: z.string(),
  fileContent: z.string(),
  fileName: z.string(),
  userName: z.string().nullable(),
});

const chatConfigSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.enum(['chat', 'upload', 'quiz']).default('chat'),
  systemPrompt: z.string().min(1, "System prompt is required"),
  userInstructions: z.string().nullable(),
  feedbackCriteria: z.string().nullable(),
  questions: z.array(z.object({
    question: z.string(),
    recommendedAnswer: z.string()
  })).optional(),
});

const configSchema = z.object({
  systemPrompt: z.string(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(100).max(4000).default(1000)
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: false
});

// Store sessions in memory
const sessions: Record<string, Message[]> = {};

export function registerRoutes(app: Express): Server {
  // Set up authentication routes and middleware
  setupAuth(app);

  // Middleware to check authentication for API routes
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  // Protect all chat config related routes
  app.get("/api/chat-configs", requireAuth, async (req: Request, res: Response) => {
    try {
      const showDeleted = req.query.showDeleted === 'true';
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Get user's own configs
      const configs = await db.query.chatConfigs.findMany({
        where: and(
          showDeleted ? undefined : eq(chatConfigs.deleted, false),
          // Only return configs that are owned by the current user
          eq(chatConfigs.userId, userId)
        ),
        orderBy: [desc(chatConfigs.createdAt)],
        with: {
          conversations: true,
          uploads: true,
          quizQuestions: true
        }
      });

      // Get public templates separately
      const templates = await db.query.chatConfigs.findMany({
        where: and(
          eq(chatConfigs.isTemplate, true),
          showDeleted ? undefined : eq(chatConfigs.deleted, false)
        ),
        orderBy: [desc(chatConfigs.createdAt)],
        with: {
          conversations: true,
          uploads: true,
          quizQuestions: true
        }
      });

      // Combine user's configs and public templates
      const allConfigs = [...configs, ...templates];

      const configsWithCount = allConfigs.map(config => ({
        ...config,
        conversationCount: config.type === 'upload' ? config.uploads.length : config.conversations.length,
        conversations: undefined,
        uploads: undefined,
        quizQuestions: config.quizQuestions.map(q => ({
          question: q.question,
          recommendedAnswer: q.recommendedAnswer
        }))
      }));

      res.json(configsWithCount);
    } catch (error: any) {
      console.error("Error fetching chat configs:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/chat-configs/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.id);
      const userId = req.user?.id;

      if (isNaN(configId)) {
        return res.status(400).json({ error: "Invalid config ID" });
      }

      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const config = await db.query.chatConfigs.findFirst({
        where: and(
          eq(chatConfigs.id, configId),
          or(
            eq(chatConfigs.userId, userId),
            eq(chatConfigs.isTemplate, true)
          )
        ),
        with: {
          quizQuestions: {
            orderBy: [asc(quizQuestions.order)]
          }
        }
      });

      if (!config) {
        return res.status(404).json({ error: "Configuration not found" });
      }

      // Transform the response to match the expected format
      const responseConfig = {
        ...config,
        questions: config.quizQuestions?.map(q => ({
          question: q.question,
          recommendedAnswer: q.recommendedAnswer
        }))
      };

      res.json(responseConfig);
    } catch (error: any) {
      console.error("Error fetching chat config:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/chat-configs", requireAuth, async (req: Request, res: Response) => {
    try {
      const { title, type, systemPrompt, userInstructions, feedbackCriteria, questions } = chatConfigSchema.parse(req.body);

      // Get the user ID from the authenticated request
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Begin a transaction
      const newConfig = await db.transaction(async (tx) => {
        // First create the chat config
        const [config] = await tx.insert(chatConfigs).values({
          title,
          type,
          systemPrompt,
          userInstructions,
          feedbackCriteria,
          userId,
          deleted: false,
          createdAt: new Date()
        }).returning();

        // If this is a quiz type and questions were provided, insert them
        if (type === 'quiz' && questions?.length) {
          await tx.insert(quizQuestions).values(
            questions.map((q, index) => ({
              configId: config.id,
              question: q.question,
              recommendedAnswer: q.recommendedAnswer,
              order: index
            }))
          );
        }

        return config;
      });

      // Fetch the complete config with questions
      const completeConfig = await db.query.chatConfigs.findFirst({
        where: eq(chatConfigs.id, newConfig.id),
        with: {
          quizQuestions: {
            orderBy: [asc(quizQuestions.order)]
          }
        }
      });

      // Transform the response to match the expected format
      const responseConfig = {
        ...completeConfig,
        questions: completeConfig?.quizQuestions?.map(q => ({
          question: q.question,
          recommendedAnswer: q.recommendedAnswer
        }))
      };

      res.json(responseConfig);
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

      const { title, type, systemPrompt, userInstructions, feedbackCriteria, questions } = chatConfigSchema.parse(req.body);

      // Begin a transaction
      const updatedConfig = await db.transaction(async (tx) => {
        // First update the chat config
        const [config] = await tx.update(chatConfigs)
          .set({
            title,
            type,
            systemPrompt,
            userInstructions,
            feedbackCriteria,
          })
          .where(and(
            eq(chatConfigs.id, configId),
            eq(chatConfigs.userId, userId)
          ))
          .returning();

        // If this is a quiz type, update the questions
        if (type === 'quiz') {
          // Delete existing questions
          await tx.delete(quizQuestions)
            .where(eq(quizQuestions.configId, configId));

          // Insert new questions if provided
          if (questions?.length) {
            await tx.insert(quizQuestions).values(
              questions.map((q, index) => ({
                configId,
                question: q.question,
                recommendedAnswer: q.recommendedAnswer,
                order: index
              }))
            );
          }
        }

        return config;
      });

      // Fetch the complete config with questions
      const completeConfig = await db.query.chatConfigs.findFirst({
        where: eq(chatConfigs.id, updatedConfig.id),
        with: {
          quizQuestions: {
            orderBy: [asc(quizQuestions.order)]
          }
        }
      });

      // Transform the response to match the expected format
      const responseConfig = {
        ...completeConfig,
        questions: completeConfig?.quizQuestions?.map(q => ({
          question: q.question,
          recommendedAnswer: q.recommendedAnswer
        }))
      };

      res.json(responseConfig);
    } catch (error: any) {
      console.error("Error updating chat config:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/chat-hint", requireAuth, async (req: Request, res: Response) => {
    try {
      const { feedbackCriteria, userInstructions, messages } = req.body;

      if (!feedbackCriteria) {
        return res.status(400).json({ error: "Feedback criteria is required" });
      }

      const prompt = `Based on these criteria:\n${feedbackCriteria}\n\nAnd these instructions:\n${userInstructions || 'No specific instructions'}\n\nAnalyze the current conversation and provide a helpful hint for the user to improve their responses. Keep the hint concise and specific. \nWrite the hint straight out - don't include "Hint:" at the beginning of your response.\n Limit the response to 2 sentences.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4",
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
        max_tokens: 200,
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
  app.get("/api/messages", requireAuth, async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.query.configId as string);
      const sessionId = req.query.sessionId as string || crypto.randomUUID();
      const userName = req.query.userName as string || null;

      if (isNaN(configId)) {
        return res.status(400).json({ error: "Valid config ID is required" });
      }

      const conversation = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.configId, configId),
          eq(conversations.sessionId, sessionId)
        ),
      });

      if (!sessions[sessionId]) {
        sessions[sessionId] = conversation?.messages || [];
      }

      res.json({
        messages: sessions[sessionId],
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

  app.post("/api/messages", requireAuth, async (req: Request, res: Response) => {
    try {
      const { content, config: configData } = req.body;
      const configId = parseInt(req.query.configId as string);
      const sessionId = req.query.sessionId as string || crypto.randomUUID();
      const userName = req.query.userName as string || null;

      if (!content) {
        return res.status(400).json({ error: "Message content is required" });
      }

      if (isNaN(configId)) {
        return res.status(400).json({ error: "Valid config ID is required" });
      }

      const parsedConfig = configSchema.parse(configData);

      if (!sessions[sessionId]) {
        const existingConversation = await db.query.conversations.findFirst({
          where: and(
            eq(conversations.configId, configId),
            eq(conversations.sessionId, sessionId)
          ),
        });
        sessions[sessionId] = existingConversation?.messages || [];
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
      sessions[sessionId].push(userMessage);

      try {
        await db
          .insert(conversations)
          .values({
            configId,
            sessionId,
            userName,
            messages: sessions[sessionId],
          })
          .onConflictDoUpdate({
            target: [conversations.configId, conversations.sessionId],
            set: {
              messages: sessions[sessionId]
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

      for (const m of sessions[sessionId]) {
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
          model: "gpt-4o",
          messages: apiMessages,
          temperature: parsedConfig.temperature,
          max_tokens: parsedConfig.maxTokens,
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
        sessions[sessionId].push(assistantMessage);

        await db
          .update(conversations)
          .set({
            messages: sessions[sessionId]
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

  app.post("/api/upload-feedback", requireAuth, async (req: Request, res: Response) => {
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
        model: "gpt-4o",
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
        temperature: 0.7,
        max_tokens: 1000,
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

  app.post("/api/chat-feedback", requireAuth, async (req: Request, res: Response) => {
    try {
      const { configId, sessionId, messages } = req.body;

      if (!configId || !sessionId || !messages) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      const config = await db.query.chatConfigs.findFirst({
        where: eq(chatConfigs.id, configId),
      });

      if (!config) {
        return res.status(404).json({ error: "Configuration not found" });
      }

      if (!config.feedbackCriteria) {
        return res.status(400).json({ error: "Feedback criteria not set for this configuration" });
      }

      const prompt = `Context:\n${config.systemPrompt}\n\nAnalyze the conversation based on these criteria:\n${config.feedbackCriteria}\n\nAddress the user as 'you' in your response (and do not just say 'the user').\n\nPlease provide your analysis in exactly this format, ensuring you are evaluating the user's side of the conversation (i.e. the person who first types, NOT the GPT (which is you as the bot):\n\n• [3 bullet points focusing on how well the conversation meets the criteria. Keep each bullet to 1 sentence]\n\nScore: [1-10]\n[Brief one-line summary of overall quality]`;

      const conversation = messages.map((m: Message) =>
        `${m.role}: ${typeof m.content === 'string' ? m.content : m.content.text}`
      ).join('\n');

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
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
        max_tokens: 1000,
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
        summary
      };

      await db
        .update(conversations)
        .set({
          feedback: feedbackData
        })
        .where(and(
          eq(conversations.configId, configId),
          eq(conversations.sessionId, sessionId)
        ));

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

  app.get("/api/conversations/:configId", requireAuth, async (req: Request, res: Response) => {
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
        const conversationData = await db.query.conversations.findMany({
          where: eq(conversations.configId, configId),
          orderBy: [desc(conversations.createdAt)]
        });

        const conversationsWithMetadata = conversationData.map(conv => ({
          sessionId: conv.sessionId,
          userName: conv.userName,
          messages: conv.messages,
          feedback: conv.feedback
        }));

        res.json(conversationsWithMetadata);
      }
    } catch (error: any) {
      console.error("[GET /api/conversations] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/analyze-themes", requireAuth, async (req: Request, res: Response) => {
    try {
      const { feedbacks } = req.body;

      if (!Array.isArray(feedbacks)) {
        return res.status(400).json({ error: "Feedbacks must be an array" });
      }

      const allBullets = feedbacks
        .flatMap(feedback => feedback.bullets || [])
        .filter(bullet => bullet);

      if (allBullets.length === 0) {
        return res.json({
          positive: "No positive themes identified yet",
          constructive: "No constructive feedback available yet"
        });
      }

      const prompt = `Analyze these feedback points and identify two key themes:

Feedback points:
${allBullets.map(bullet => `- ${bullet}`).join('\n')}

Please provide exactly two themes in JSON format:
1. One positive theme highlighting what's being done well
2. One constructive theme suggesting an area for improvement

Response Format:
{
  "positive": "A clear, concise positive theme",
  "constructive": "A clear, concise constructive theme"
}

Rules:
- Each theme should be 1-2 sentences
- Use third-person perspective (e.g., "learners" or "users", not "you")
- Be specific and actionable
- Base themes on patterns across multiple feedback points when possible`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
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
        response_format: { type: "json_object" }
      });

      const themes = JSON.parse(completion.choices[0].message.content);
      res.json(themes);
    } catch (error: any) {
      console.error("Error analyzing themes:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/chat-configs/:id/template", requireAuth, async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.id);

      if (isNaN(configId)) {
        return res.status(400).json({ error: "Invalid config ID" });
      }

      // Update the config to mark it as a template
      const { templateDescription } = req.body;
      const updatedConfig = await db.update(chatConfigs)
        .set({
          isTemplate: true,
          templateDescription: templateDescription || null
        })
        .where(eq(chatConfigs.id, configId))
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

  app.get("/api/templates", requireAuth, async (req: Request, res: Response) => {
    try {
      const templates = await db.query.chatConfigs.findMany({
        where: and(
          eq(chatConfigs.isTemplate, true),
          eq(chatConfigs.deleted, false)
        ),
        orderBy: [desc(chatConfigs.createdAt)],
      });

      const templatesWithoutPrivateData = templates.map(template => ({
        ...template,
        userId: undefined // Remove userId from public templates
      }));

      res.json(templatesWithoutPrivateData);
    } catch (error: any) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ error: error.message });
    }
  });


  const httpServer = createServer(app);
  return httpServer;
}