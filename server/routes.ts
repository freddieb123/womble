import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { chatConfigs, conversations, uploads, type Message, type ConversationFeedback, type UploadFeedback } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import crypto from 'crypto';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources';

const uploadFeedbackSchema = z.object({
  configId: z.number(),
  sessionId: z.string(),
  fileContent: z.string(),
  fileName: z.string(),
  userName: z.string().nullable(),
});

const chatConfigSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.enum(['chat', 'upload']).default('chat'),
  systemPrompt: z.string().min(1, "System prompt is required"),
  userInstructions: z.string().nullable(),
  feedbackCriteria: z.string().nullable(),
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
  // Chat configs endpoints
  app.get("/api/chat-configs", async (req: Request, res: Response) => {
    try {
      const showDeleted = req.query.showDeleted === 'true';
      const configs = await db.query.chatConfigs.findMany({
        where: showDeleted ? undefined : eq(chatConfigs.deleted, false),
        orderBy: [desc(chatConfigs.createdAt)],
        with: {
          conversations: true,
          uploads: true,
        }
      }).then(configs => configs.filter(config => showDeleted || !config.deleted));

      const configsWithCount = configs.map(config => ({
        ...config,
        conversationCount: config.type === 'upload' ? config.uploads.length : config.conversations.length,
        conversations: undefined,
        uploads: undefined
      }));

      res.json(configsWithCount);
    } catch (error: any) {
      console.error("Error fetching chat configs:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/chat-configs/:id", async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.id);

      if (isNaN(configId)) {
        return res.status(400).json({ error: "Invalid config ID" });
      }

      const config = await db.query.chatConfigs.findFirst({
        where: eq(chatConfigs.id, configId),
      });

      if (!config) {
        return res.status(404).json({ error: "Configuration not found" });
      }

      res.json(config);
    } catch (error: any) {
      console.error("Error fetching chat config:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/chat-configs", async (req: Request, res: Response) => {
    try {
      const { title, type, systemPrompt, userInstructions, feedbackCriteria } = chatConfigSchema.parse(req.body);

      const newConfig = await db.insert(chatConfigs).values({
        title,
        type,
        systemPrompt,
        userInstructions,
        feedbackCriteria,
        deleted: false,
        createdAt: new Date()
      }).returning();

      res.json(newConfig[0]);
    } catch (error: any) {
      console.error("Error creating chat config:", error);
      res.status(400).json({ error: error.message });
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
  app.get("/api/messages", async (req: Request, res: Response) => {
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

  app.post("/api/messages", async (req: Request, res: Response) => {
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

      const prompt = `Analyze the uploaded screenshot based on these criteria:\n${config.feedbackCriteria}\n\nAddress the user as 'you' in your response (and do not just say 'the user').\n\nPlease provide your analysis in exactly this format, ensuring you are evaluating the user's side of the conversation (i.e. the person who first types, NOT the GPT (which is you as the bot):\n\n• [3 bullet points focusing on how well the screenshot meets the criteria. Keep each bullet to 1 sentence]\n\nScore: [1-10]\n[Brief one-line summary of overall quality]`;

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

  app.post("/api/chat-feedback", async (req: Request, res: Response) => {
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

      const prompt = `Analyze the conversation based on these criteria:\n${config.feedbackCriteria}\n\nAddress the user as 'you' in your response (and do not just say 'the user').\n\nPlease provide your analysis in exactly this format, ensuring you are evaluating the user's side of the conversation (i.e. the person who first types, NOT the GPT (which is you as the bot):\n\n• [3 bullet points focusing on how well the conversation meets the criteria. Keep each bullet to 1 sentence]\n\nScore: [1-10]\n[Brief one-line summary of overall quality]`;

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

  app.delete("/api/chat-configs/:id", async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.id);

      if (isNaN(configId)) {
        return res.status(400).json({ error: "Invalid config ID" });
      }

      await db
        .update(chatConfigs)
        .set({ deleted: true, deletedAt: new Date() })
        .where(eq(chatConfigs.id, configId));

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

  const httpServer = createServer(app);
  return httpServer;
}