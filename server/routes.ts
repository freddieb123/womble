import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { chatConfigs, conversations } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import crypto from 'crypto';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// Define schemas
const messageContentSchema = z.object({
  text: z.string(),
  image: z.string().nullable()
});

const chatConfigSchema = z.object({
  title: z.string().min(1, "Title is required"),
  systemPrompt: z.string().min(1, "System prompt is required"),
  userInstructions: z.string().nullable(),
  feedbackCriteria: z.string().nullable(),
  temperature: z.number().optional().default(0.7),
  maxTokens: z.number().optional().default(1000),
});

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: false
});

const sessions: Record<string, any[]> = {};

function getSessionId(req: Request): string {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const sessionId = url.searchParams.get("sessionId");
  return sessionId || crypto.randomUUID();
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

      const parsedConfig = chatConfigSchema.parse(config);

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

      const userMessage = {
        id: crypto.randomUUID(),
        content: {
          text: content.text,
          image: content.image
        },
        role: 'user' as const,
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

      let apiMessages: ChatCompletionMessageParam[] = [
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
        // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
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

        const assistantMessage = {
          id: messageId,
          content: accumulatedMessage,
          role: 'assistant' as const,
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
      const { feedbackCriteria, messages } = req.body;

      if (!feedbackCriteria) {
        return res.status(400).json({ error: "Feedback criteria is required" });
      }

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({
          error: "No chat messages to analyze. Please have a conversation first before requesting feedback."
        });
      }

      const hasUserMessage = messages.some(m => m.role === 'user');
      const hasAssistantMessage = messages.some(m => m.role === 'assistant');

      if (!hasUserMessage || !hasAssistantMessage) {
        return res.status(400).json({
          error: "Please complete at least one exchange before requesting feedback."
        });
      }

      // Format messages to include both text and image content
      const formattedMessages = messages.map(m => {
        if (typeof m.content === 'string') {
          return `${m.role}: ${m.content}`;
        }

        let content = m.content.text || '';
        if (m.content.image) {
          content += ' [Image shared]';
        }
        return `${m.role}: ${content}`;
      }).join('\n');

      const prompt = `Analyze the user's interactions in this conversation based on these criteria: ${feedbackCriteria}

      Consider both text messages and any shared images when providing feedback.

      Please provide your feedback in exactly this format:

      • [3 bullet points focusing ONLY on the user's conversation so far and how well they met the criteria]

      Score: [1-10]
      [Brief one-line summary of overall performance]

      Chat transcript:
      ${formattedMessages}`;

      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert at evaluating user communication. Focus your feedback solely on the user's messages and interactions, taking into account both text messages and shared images. Address the user directly using 'you' in your feedback. For example: 'You maintained clear communication' instead of 'The user maintained clear communication'. Keep feedback points brief, clear, and actionable. Always follow the exact format specified, with 3 bullet points followed by a score and one-line summary."
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

      res.json({
        bullets,
        score,
        summary
      });
    } catch (error: any) {
      console.error("Error getting feedback:", error);
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}