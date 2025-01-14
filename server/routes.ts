import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { chatConfigs, conversations } from "@db/schema";
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

interface Message {
  role: 'user' | 'assistant';
  content: string | {
    text: string;
    image?: string | null;
  };
  timestamp: number;
  id: string;
  sessionId: string;
}

interface FeedbackData {
  bullets: string[];
  score: number;
  summary: string | null;
  rawFeedback?: string;
}

interface Conversation {
  sessionId: string;
  feedback?: FeedbackData | null;
  messages: Message[];
  userName?: string;
}

export function registerRoutes(app: Express): Server {
  app.get("/api/messages", async (req: Request, res: Response) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const configId = parseInt(url.searchParams.get("configId") || "");
      const sessionId = url.searchParams.get("sessionId") || crypto.randomUUID();

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

      console.log("Saved chat config:", result[0]);
      res.json(result[0]);
    } catch (error: any) {
      console.error("Error saving chat config:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/chat-configs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      const config = await db.query.chatConfigs.findFirst({
        where: eq(chatConfigs.id, id),
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
  app.get("/api/chat-configs", async (req, res) => {
    try {
      const showDeleted = req.query.showDeleted === 'true';
      const query = db.query.chatConfigs.findMany({
        where: showDeleted ? undefined : eq(chatConfigs.deleted, false),
        orderBy: (chatConfigs, { desc }) => [desc(chatConfigs.createdAt)],
        with: {
          conversations: true,
        }
      });

      const configs = await query;

      const configsWithCount = configs.map(config => ({
        ...config,
        conversationCount: config.conversations.length,
        conversations: undefined
      }));

      res.json(configsWithCount);
    } catch (error: any) {
      console.error("Error fetching chat configs:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/chat-configs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      const parsedConfig = chatConfigSchema.parse(req.body);
      const result = await db.update(chatConfigs)
        .set({
          title: parsedConfig.title,
          type: parsedConfig.type || 'chat',
          systemPrompt: parsedConfig.systemPrompt,
          userInstructions: parsedConfig.userInstructions,
          feedbackCriteria: parsedConfig.feedbackCriteria,
        })
        .where(eq(chatConfigs.id, id))
        .returning();

      if (!result.length) {
        return res.status(404).json({ error: "Configuration not found" });
      }

      res.json(result[0]);
    } catch (error: any) {
      console.error("Error updating chat config:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/chat-configs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      const result = await db.update(chatConfigs)
        .set({
          deleted: true,
          deletedAt: new Date()
        })
        .where(eq(chatConfigs.id, id))
        .returning();

      if (!result.length) {
        return res.status(404).json({ error: "Configuration not found" });
      }

      res.json(result[0]);
    } catch (error: any) {
      console.error("Error soft deleting chat config:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/chat-configs/:id/restore", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      const result = await db.update(chatConfigs)
        .set({
          deleted: false,
          deletedAt: null
        })
        .where(eq(chatConfigs.id, id))
        .returning();

      if (!result.length) {
        return res.status(404).json({ error: "Configuration not found" });
      }

      res.json(result[0]);
    } catch (error: any) {
      console.error("Error restoring chat config:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/messages", async (req: Request, res: Response) => {
    try {
      const { content, config } = req.body;
      const url = new URL(req.url, `http://${req.headers.host}`);
      const configId = parseInt(url.searchParams.get("configId") || "");
      const sessionId = url.searchParams.get("sessionId") || crypto.randomUUID();
      const userName = url.searchParams.get('userName');

      try {
        messageContentSchema.parse(content);
      } catch (e) {
        console.error("Message content validation failed:", e);
        return res.status(400).json({ error: "Invalid message content format" });
      }

      if (!content.text && !content.image) {
        return res.status(400).json({ error: "Message must contain either text or an image" });
      }

      if (isNaN(configId) || configId <= 0) {
        return res.status(400).json({ error: "Valid config ID is required" });
      }

      if (!userName) {
        return res.status(400).json({ error: "userName is required" });
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
        content: {
          text: content.text,
          image: content.image
        },
        role: 'user',
        timestamp: Date.now(),
        sessionId
      };
      sessions[sessionId].push(userMessage);

      try {
        const existingConversation = await db.query.conversations.findFirst({
          where: and(
            eq(conversations.configId, configId),
            eq(conversations.sessionId, sessionId)
          ),
        });

        if (existingConversation) {
          await db
            .update(conversations)
            .set({
              messages: JSON.stringify(sessions[sessionId])
            })
            .where(and(
              eq(conversations.configId, configId),
              eq(conversations.sessionId, sessionId)
            ));
        } else {
          await db
            .insert(conversations)
            .values({
              configId,
              sessionId,
              userName,
              messages: JSON.stringify(sessions[sessionId])
            });
        }
      } catch (error) {
        console.error("Error saving conversation:", error);
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const enhancedSystemPrompt = userName
        ? `${parsedConfig.systemPrompt}\n\nIMPORTANT INSTRUCTION: The user's name is "${userName}". You must follow these rules:\n1. Your VERY FIRST WORDS must be a greeting with their name (e.g. "Hello ${userName}!" or "Hi ${userName}!")\n2. Never skip the name in the initial greeting\n3. Don't use the name too much!`
        : parsedConfig.systemPrompt;

      // Fix the chat API messages array construction type error
      const apiMessages: ChatCompletionMessageParam[] = [
        { role: "system", content: enhancedSystemPrompt }
      ];

      // Add messages with proper format for Vision API
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
          // Handle messages with images using proper typing for OpenAI API
          const content: Array<{ type: "text"; text: string; } | { type: "image_url"; image_url: { url: string; } }> = [
            {
              type: "text",
              text: m.content.text || "Please analyze this image."
            },
            {
              type: "image_url",
              image_url: {
                url: m.content.image as string
              }
            }
          ];

          // Explicitly type the message for OpenAI API
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
          // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
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

        res.write('data: [DONE]\n\n');
        res.end();
      } catch (streamError) {
        console.error("Stream error:", streamError);
        res.write(`data: ${JSON.stringify({ error: "Error processing image or generating response" })}\n\n`);
        res.end();
      }
    } catch (error: any) {
      console.error("Error processing message:", error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }

  });

  app.post("/api/chat-feedback", async (req: Request, res: Response) => {
    try {
      const { feedbackCriteria, messages, type } = req.body;
      const sessionId = getSessionId(req);
      const configId = parseInt(new URL(req.url, `http://${req.headers.host}`).searchParams.get("configId") || "0");

      console.log('Received feedback request:', { feedbackCriteria, messageCount: messages?.length, configId, sessionId, type });

      if (!feedbackCriteria) {
        return res.status(400).json({ error: "Feedback criteria is required" });
      }

      const messagesToAnalyze = messages || (sessions[sessionId] || []);

      if (type === 'upload') {
        // For upload type, we need at least one message and it should be an upload
        if (!Array.isArray(messagesToAnalyze) || messagesToAnalyze.length === 0) {
          return res.status(400).json({
            error: "No uploads found to analyze."
          });
        }

        // Verify if there's at least one upload message
        const hasUploadMessage = messagesToAnalyze.some(message => {
          const content = typeof message.content === 'string'
            ? message.content
            : message.content.text;
          return content.includes('Uploaded file:');
        });

        if (!hasUploadMessage) {
          return res.status(400).json({
            error: "No uploads found to analyze."
          });
        }
      } else {
        // For chat type, we need the regular message validation
        if (!Array.isArray(messagesToAnalyze) || messagesToAnalyze.length === 0) {
          return res.status(400).json({
            error: "No chat messages to analyze. Please have a conversation first before requesting feedback."
          });
        }

        const hasUserMessage = messagesToAnalyze.some(m => m.role === 'user');
        const hasAssistantMessage = messagesToAnalyze.some(m => m.role === 'assistant');

        if (!hasUserMessage || !hasAssistantMessage) {
          return res.status(400).json({
            error: "Please have at least one complete exchange before requesting feedback."
          });
        }
      }

      if (configId) {
        const conversation = await db.query.conversations.findFirst({
          where: and(
            eq(conversations.configId, configId),
            eq(conversations.sessionId, sessionId)
          )
        });
      }

      const prompt = `Analyze the user's interactions in this conversation based on these criteria: ${feedbackCriteria}

      Please provide your feedback in exactly this format:

      • [3 bullet points focusing ONLY on the user's conversation so far and how well they met the criteria]

      Score: [1-10]
      [Brief one-line summary of overall performance. Make sure you don't give anything above a 5 if they haven't yet come to an agreement]

      Chat transcript:
      ${messagesToAnalyze.map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join('\n')}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert at evaluating user communication. Focus your feedback solely on the user's messages and interactions, taking into account how they respond to the AI assistant. Address the user directly using 'you' in your feedback. For example: 'You maintained clear communication' instead of 'The user maintained clear communication'. Keep feedback points brief, clear, and actionable."
          },
          { role: "user", content: prompt }
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
        summary,
        rawFeedback: response
      };

      if (configId) {
        await db.update(conversations)
          .set({ feedback: JSON.stringify(feedbackData) })
          .where(
            and(
              eq(conversations.configId, configId),
              eq(conversations.sessionId, sessionId)
            )
          );
      }

      res.json(feedbackData);
    } catch (error: any) {
      console.error("Error getting feedback:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/chat-hint", async (req: Request, res: Response) => {
    try {
      const { feedbackCriteria, userInstructions, messages } = req.body;

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

  // Add better type checking and error handling for conversations endpoint
  app.get("/api/conversations/:configId", async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.configId);
      console.log("[GET /api/conversations] ConfigId:", configId);

      if (isNaN(configId)) {
        return res.status(400).json({ error: "Invalid config ID" });
      }

      // First get the config to determine its type
      const config = await db.query.chatConfigs.findFirst({
        where: eq(chatConfigs.id, configId),
      });

      console.log("[GET /api/conversations] Config type:", config?.type);

      if (!config) {
        return res.status(404).json({ error: "Configuration not found" });
      }

      const savedConversations = await db.query.conversations.findMany({
        where: eq(conversations.configId, configId),
        orderBy: [desc(conversations.createdAt)]
      });

      console.log("[GET /api/conversations] Found conversations:", savedConversations.length);

      const parseMessages = (messagesData: any): Message[] => {
        try {
          console.log("[parseMessages] Input:", typeof messagesData, messagesData);
          if (typeof messagesData === 'string') {
            return JSON.parse(messagesData);
          }
          return Array.isArray(messagesData) ? messagesData : [];
        } catch (e) {
          console.error('[parseMessages] Error:', e);
          return [];
        }
      };

      // Add proper parsing for doubly-encoded JSON feedback
      const parseFeedback = (feedbackData: any): FeedbackData | null => {
        try {
          console.log("[parseFeedback] Input:", typeof feedbackData, feedbackData);
          if (!feedbackData) return null;

          // Handle doubly-encoded JSON strings
          let parsed = feedbackData;
          if (typeof feedbackData === 'string') {
            try {
              parsed = JSON.parse(feedbackData);
              // If it's still a string (double encoded), parse again
              if (typeof parsed === 'string') {
                parsed = JSON.parse(parsed);
              }
            } catch (e) {
              console.error('[parseFeedback] Error parsing JSON:', e);
              return null;
            }
          }

          if (parsed && typeof parsed === 'object' && 'bullets' in parsed) {
            return {
              bullets: parsed.bullets,
              score: parsed.score,
              summary: parsed.summary,
              rawFeedback: typeof feedbackData === 'string' ? feedbackData : JSON.stringify(feedbackData)
            };
          }
          return null;
        } catch (e) {
          console.error('[parseFeedback] Error:', e);
          return null;
        }
      };

      let conversationsWithMetadata: Conversation[] = [];

      if (config.type === 'upload') {
        // For upload type, we only need the latest feedback per session
        console.log("[GET /api/conversations] Processing upload type conversations");
        const processedConversations = savedConversations
          .map(conv => {
            console.log("[Processing conversation]", {
              sessionId: conv.sessionId,
              hasFeedback: !!conv.feedback
            });

            const feedback = parseFeedback(conv.feedback);
            console.log("[Parsed feedback]", feedback);

            const messages = parseMessages(conv.messages);
            console.log("[Parsed messages]", messages.length);

            // Only include conversations with valid feedback for upload type
            if (!feedback) {
              console.log("[Skipping] No valid feedback for session", conv.sessionId);
              return null;
            }

            return {
              sessionId: conv.sessionId,
              feedback,
              messages: messages.length > 0 ? messages : [{
                role: 'user',
                content: 'Upload content not available',
                timestamp: Date.now(),
                id: crypto.randomUUID(),
                sessionId: conv.sessionId
              }]
            } as Conversation;
          })
          .filter((conv): conv is Conversation => conv !== null);

        conversationsWithMetadata = processedConversations;
      } else {
        // For chat type, include all messages and feedback
        conversationsWithMetadata = savedConversations
          .map(conv => {
            const messages = parseMessages(conv.messages);
            if (messages.length === 0) return null;

            const conversation: Conversation = {
              sessionId: conv.sessionId,
              messages,
              userName: conv.user_name || undefined,
              feedback: parseFeedback(conv.feedback)
            };
            return conversation;
          })
          .filter((conv): conv is Conversation => conv !== null);
      }

      console.log("[GET /api/conversations] Final response:", {
        count: conversationsWithMetadata.length,
        conversations: conversationsWithMetadata.map(c => ({
          sessionId: c.sessionId,
          hasFeedback: !!c.feedback,
          messageCount: c.messages.length
        }))
      });

      res.json(conversationsWithMetadata);
    } catch (error: any) {
      console.error("[GET /api/conversations] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/improve-criteria", async (req: Request, res: Response) => {
    try {
      const { feedbackCriteria } = req.body;

      if (!feedbackCriteria) {
        return res.status(400).json({ error: "Feedback criteria is required" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert at creating effective feedback criteria for evaluating soft skills and interactions. Your goal is to enhance existing feedback criteria to be more comprehensive, clear, and actionable while maintaining its core purpose."
          },
          {
            role: "user",
            content: `Please improve the following feedback criteria to be more comprehensive, specific, and effective at evaluating user interactions. Maintain the same general purpose but make it as actionable as possible. Don't make it longer than 5 points. Here's the current criteria:\n\n${feedbackCriteria}`
          }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });

      const improvedCriteria = response.choices[0]?.message?.content;
      if (!improvedCriteria) {
        throw new Error("Failed to get improved criteria from OpenAI");
      }

      res.json({ improvedCriteria });
    } catch (error: any) {
      console.error("Error improving criteria:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Add new upload feedback route
  app.post("/api/upload-feedback", async (req: Request, res: Response) => {
    try {
      const { configId, sessionId, fileContent, fileName } = uploadFeedbackSchema.parse(req.body);

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

      // Insert or update the conversation with feedback
      await db.insert(conversations)
        .values({
          configId,
          sessionId,
          messages: JSON.stringify([{
            role: 'user',
            content: `Uploaded file: ${fileName}`,
            timestamp: Date.now(),
            id: crypto.randomUUID()
          }]),
          feedback: JSON.stringify(feedbackData)
        })
        .onConflictDoUpdate({
          target: [conversations.configId, conversations.sessionId],
          set: {
            messages: JSON.stringify([{
              role: 'user',
              content: `Uploaded file: ${fileName}`,
              timestamp: Date.now(),
              id: crypto.randomUUID()
            }]),
            feedback: JSON.stringify(feedbackData)
          }
        });

      res.json(feedbackData);
    } catch (error: any) {
      console.error("Error processing upload feedback:", error);
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

function getSessionId(req: Request): string {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const sessionId = url.searchParams.get("sessionId");
  return sessionId || crypto.randomUUID();
}

const configSchema = z.object({
  systemPrompt: z.string(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().min(100).max(4000)
});