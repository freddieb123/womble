import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { chatConfigs, conversations, uploads } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import crypto from 'crypto';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// Add file handling schema
const uploadFeedbackSchema = z.object({
  configId: z.number(),
  sessionId: z.string(),
  fileContent: z.string(),
  fileName: z.string(),
});

interface MessageContent {
  text: string;
  image?: string | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string | MessageContent;
  timestamp: number;
  id: string;
  sessionId: string;
}

interface ConversationData {
  messages: Message[];
  userName: string | null;
  sessionId: string;
}

interface UploadData {
  fileName: string;
  userName: string | null;
  sessionId: string;
  feedback: {
    bullets: string[];
    score: number;
    summary: string | null;
  } | null;
}

export function registerRoutes(app: Express): Server {
  app.get("/api/messages", async (req: Request, res: Response) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const configId = parseInt(url.searchParams.get("configId") || "");
      const sessionId = url.searchParams.get("sessionId") || crypto.randomUUID();
      const userName = url.searchParams.get("userName") || null;

      if (isNaN(configId) || configId <= 0) {
        return res.status(400).json({ error: "Valid config ID is required" });
      }

      const conversation = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.configId, configId),
          eq(conversations.sessionId, sessionId)
        ),
      });

      if (!sessions[sessionId]) {
        sessions[sessionId] = conversation ?
          (typeof conversation.messages === 'string' ?
            JSON.parse(conversation.messages) :
            conversation.messages) :
          [];
      }

      const response = {
        messages: sessions[sessionId],
        isLoading: false,
        error: null
      };

      res.json(response);
    } catch (error) {
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
      const { content, config } = req.body;
      const url = new URL(req.url, `http://${req.headers.host}`);
      const configId = parseInt(url.searchParams.get("configId") || "");
      const sessionId = url.searchParams.get("sessionId") || crypto.randomUUID();
      const userName = url.searchParams.get('userName') || null;

      if (!content || (typeof content === 'object' && !content.text && !content.image)) {
        return res.status(400).json({ error: "Message must contain either text or an image" });
      }

      if (isNaN(configId) || configId <= 0) {
        return res.status(400).json({ error: "Valid config ID is required" });
      }

      const parsedConfig = configSchema.parse(config);

      if (!sessions[sessionId]) {
        const existingConversation = await db.query.conversations.findFirst({
          where: and(
            eq(conversations.configId, configId),
            eq(conversations.sessionId, sessionId)
          ),
        });

        sessions[sessionId] = existingConversation ?
          JSON.parse(existingConversation.messages as string) : [];
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
            messages: JSON.stringify(sessions[sessionId])
          })
          .onConflictDoUpdate({
            target: [conversations.configId, conversations.sessionId],
            set: {
              userName,
              messages: JSON.stringify(sessions[sessionId])
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
          const content: Array<{ type: "text"; text: string; } | { type: "image_url"; image_url: { url: string; } }> = [
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
          ];

          const message: ChatCompletionMessageParam = {
            role: m.role === 'user' ? 'user' : 'assistant',
            content
          } as ChatCompletionMessageParam;

          apiMessages.push(message);
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
          presence_penalty: 0.6,
          frequency_penalty: 0.5
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
            messages: JSON.stringify(sessions[sessionId])
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

  // Restore chat-configs endpoints
  app.post("/api/chat-configs", async (req, res) => {
    try {
      const parsedConfig = chatConfigSchema.parse(req.body);
      const result = await db.insert(chatConfigs).values({
        title: parsedConfig.title,
        type: parsedConfig.type || 'chat',
        systemPrompt: parsedConfig.systemPrompt,
        userInstructions: parsedConfig.userInstructions,
        feedbackCriteria: parsedConfig.feedbackCriteria,
      }).returning();

      res.json(result[0]);
    } catch (error: any) {
      console.error("Error saving chat config:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/chat-configs", async (req, res) => {
    try {
      const showDeleted = req.query.showDeleted === 'true';
      const configs = await db.query.chatConfigs.findMany({
        where: showDeleted ? undefined : eq(chatConfigs.deleted, false),
        orderBy: [desc(chatConfigs.createdAt)],
        with: {
          conversations: true,
          uploads: true,
        }
      });

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

  app.post("/api/upload-feedback", async (req: Request, res: Response) => {
    try {
      const { configId, sessionId, fileContent, fileName } = uploadFeedbackSchema.parse(req.body);
      const userName = req.query.userName as string || null;

      const config = await db.query.chatConfigs.findFirst({
        where: eq(chatConfigs.id, configId),
      });

      if (!config) {
        return res.status(404).json({ error: "Configuration not found" });
      }

      if (!config.feedbackCriteria) {
        return res.status(400).json({ error: "Feedback criteria not set for this configuration" });
      }

      const prompt = `Analyze the uploaded screenshot based on these criteria:\n${config.feedbackCriteria}\n\nPlease provide your analysis in exactly this format:\n\n• [3 bullet points focusing on how well the screenshot meets the criteria]\n\nScore: [1-10]\n[Brief one-line summary of overall quality]`;

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
      const score = scoreMatch ? parseInt(scoreMatch[1]) : null;

      const summaryMatch = response.match(/Score:\s*\d+\s*\n([^\n]+)/i);
      const summary = summaryMatch ? summaryMatch[1].trim() : null;

      const bullets = response
        .split(/Score:/i)[0]
        .split(/[•\-\*]\s+/)
        .filter(bullet => bullet.trim())
        .map(bullet => bullet.trim());

      const feedbackData = {
        bullets,
        score,
        summary
      };

      // Save to uploads table
      await db.insert(uploads)
        .values({
          configId,
          sessionId,
          userName,
          fileName,
          feedback: JSON.stringify(feedbackData)
        })
        .onConflictDoUpdate({
          target: [uploads.configId, uploads.sessionId],
          set: {
            userName,
            fileName,
            feedback: JSON.stringify(feedbackData)
          }
        });

      res.json(feedbackData);
    } catch (error: any) {
      console.error("Error processing upload feedback:", error);
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
        // Fetch uploads
        const savedUploads = await db.query.uploads.findMany({
          where: eq(uploads.configId, configId),
          orderBy: [desc(uploads.createdAt)]
        });

        const uploadsWithMetadata: UploadData[] = savedUploads.map(upload => ({
          sessionId: upload.sessionId,
          userName: upload.userName,
          fileName: upload.fileName,
          feedback: upload.feedback ? JSON.parse(upload.feedback as string) : null
        }));

        res.json(uploadsWithMetadata);
      } else {
        // Fetch conversations
        const savedConversations = await db.query.conversations.findMany({
          where: eq(conversations.configId, configId),
          orderBy: [desc(conversations.createdAt)]
        });

        const conversationsWithMetadata: ConversationData[] = savedConversations.map(conv => ({
          sessionId: conv.sessionId,
          userName: conv.userName,
          messages: typeof conv.messages === 'string' ?
            JSON.parse(conv.messages) :
            conv.messages as Message[]
        }));

        res.json(conversationsWithMetadata);
      }
    } catch (error: any) {
      console.error("[GET /api/conversations] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/chat-hint", async (req: Request, res: Response) => {
    try {
      const { feedbackCriteria, userInstructions, messages } = req.body;
      const userName = req.query.userName as string || null;

      if (!feedbackCriteria) {
        return res.status(400).json({ error: "Feedback criteria is required" });
      }

      const prompt = `Based on the following conversation and context, provide a brief, encouraging suggestion directly to the user about their next message or action. You should think of this as a hint that will help them improve their feedback score.

      Context:
      ${userInstructions ? `Instructions that the user received: ${userInstructions}` : ''}
      Feedback Criteria: ${feedbackCriteria}

      Conversation so far:
      ${messages.map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join('\n')}

      Provide a single, friendly sentence starting with "Try to" or "Consider" that directly tells the user what they could do next. Focus on practical communication advice that aligns with the feedback criteria.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a friendly but expert business coach speaking directly to the user. Always phrase your suggestions in second person ('you' form) and keep them actionable and encouraging. Start with 'Try to' or 'Consider' and focus on immediate next steps the user can take."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 100,
      });

      const hint = completion.choices[0]?.message?.content?.trim();
      if (!hint) {
        throw new Error("Failed to generate hint");
      }

      res.json({ message: hint });
    } catch (error: any) {
      console.error("Error getting hint:", error);
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

const messageContentSchema = z.object({
  text: z.string(),
  image: z.string().nullable()
});

const chatConfigSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.enum(['chat', 'upload']).default('chat'),
  systemPrompt: z.string().min(1, "System prompt is required"),
  userInstructions: z.string().nullable(),
  feedbackCriteria: z.string().nullable(),
});

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: false
});

const sessions: Record<string, Message[]> = {};

const configSchema = z.object({
  systemPrompt: z.string(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().min(100).max(4000)
});