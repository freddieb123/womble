import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { chatConfigs } from "@db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import crypto from 'crypto';
import OpenAI from 'openai';

const chatConfigSchema = z.object({
  title: z.string().min(1, "Title is required"),
  systemPrompt: z.string().min(1, "System prompt is required"),
  userInstructions: z.string().nullable(),
  feedbackCriteria: z.string().nullable(),
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Store messages per session
const sessions: Record<string, {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
}[]> = {};

function getSessionId(req: Request): string {
  // Use query parameters as session identifier
  const url = new URL(req.url, `http://${req.headers.host}`);
  return url.searchParams.toString() || 'default';
}

const configSchema = z.object({
  systemPrompt: z.string(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().min(100).max(4000)
});


export function registerRoutes(app: Express): Server {
  app.get("/api/messages", (req: Request, res: Response) => {
    const sessionId = getSessionId(req);
    const sessionMessages = sessions[sessionId] || [];
    res.json({
      messages: sessionMessages,
      isLoading: false,
      error: null
    });
  });

  app.post("/api/chat-configs", async (req, res) => {
    try {
      const parsedConfig = chatConfigSchema.parse(req.body);
      const result = await db.insert(chatConfigs).values({
        title: parsedConfig.title,
        systemPrompt: parsedConfig.systemPrompt,
        userInstructions: parsedConfig.userInstructions,
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
  app.get("/api/chat-configs", async (_req, res) => {
    try {
      const configs = await db.query.chatConfigs.findMany({
        orderBy: (chatConfigs, { desc }) => [desc(chatConfigs.createdAt)]
      });
      res.json(configs);
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


  app.post("/api/messages", async (req, res) => {
    try {
      const { content, config } = req.body;
      const sessionId = getSessionId(req);
      
      if (!content || typeof content !== "string") {
        return res.status(400).send("Message content is required");
      }

      const parsedConfig = configSchema.parse(config);

      // Initialize session if it doesn't exist
      if (!sessions[sessionId]) {
        sessions[sessionId] = [];
      }

      // Add user message
      const userMessage = {
        id: crypto.randomUUID(),
        content,
        role: 'user' as const,
        timestamp: Date.now()
      };
      sessions[sessionId].push(userMessage);

      // Prepare messages for OpenAI API
      const apiMessages = [
        { role: "system", content: parsedConfig.systemPrompt },
        ...sessions[sessionId].map(m => ({
          role: m.role,
          content: m.content
        }))
      ];

      // Get OpenAI response
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: apiMessages,
        temperature: parsedConfig.temperature,
        max_tokens: parsedConfig.maxTokens,
      });

      // Add AI response
      const assistantMessage = {
        id: crypto.randomUUID(),
        content: completion.choices[0].message.content || "",
        role: 'assistant' as const,
        timestamp: Date.now()
      };
      sessions[sessionId].push(assistantMessage);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error processing message:", error);
      res.status(500).send(error.message);
    }
  });

  app.post("/api/chat-feedback", async (req: Request, res: Response) => {
    try {
      const sessionId = getSessionId(req);
      const sessionMessages = sessions[sessionId] || [];
      const { feedbackCriteria } = req.body;

      if (!feedbackCriteria) {
        return res.status(400).json({ error: "Feedback criteria is required" });
      }

      if (sessionMessages.length === 0) {
        return res.status(400).json({ error: "No chat messages to analyze" });
      }

      const prompt = `Please analyze the following chat conversation and provide feedback based on these criteria: ${feedbackCriteria}\n\nChat transcript:\n${sessionMessages.map(m => `${m.role}: ${m.content}`).join('\n')}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are an expert at providing constructive feedback on conversations." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });

      const feedback = completion.choices[0].message.content;
      res.json({ feedback });
    } catch (error: any) {
      console.error("Error getting feedback:", error);
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}