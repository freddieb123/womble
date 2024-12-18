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

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: false
});

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

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Prepare messages for OpenAI API
      const apiMessages = [
        { role: "system", content: parsedConfig.systemPrompt },
        ...sessions[sessionId].map(m => ({
          role: m.role,
          content: m.content
        }))
      ];

      let accumulatedMessage = '';
      const messageId = crypto.randomUUID();

      // Set up SSE
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      // Get OpenAI streaming response
      const stream = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: apiMessages.map(msg => ({
          role: msg.role as 'system' | 'user' | 'assistant',
          content: msg.content
        })),
        temperature: parsedConfig.temperature,
        max_tokens: parsedConfig.maxTokens,
        stream: true,
        presence_penalty: 0.6,
        frequency_penalty: 0.5,
        response_format: { type: "text" }
      });

      // Handle the stream with immediate sending
      try {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            accumulatedMessage += content;
            // Send the chunk immediately
            res.write(`data: ${JSON.stringify({ content, messageId })}\n\n`);
          }
        }
      } catch (streamError) {
        console.error("Stream error:", streamError);
        res.write(`data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`);
        res.end();
        return;
      }

      // Add the complete AI response to the session
      const assistantMessage = {
        id: messageId,
        content: accumulatedMessage,
        role: 'assistant' as const,
        timestamp: Date.now()
      };
      sessions[sessionId].push(assistantMessage);

      // End the stream
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error: any) {
      console.error("Error processing message:", error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
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

      const prompt = `Analyze this chat conversation based on these criteria: ${feedbackCriteria}

Please provide:
1. 2-3 bullet points (maximum 4) highlighting key observations
2. A score from 1-10 (where 10 is perfect) based on how well the conversation met the criteria

Chat transcript:
${sessionMessages.map(m => `${m.role}: ${m.content}`).join('\n')}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { 
            role: "system", 
            content: "You are an expert at providing concise feedback. Always respond with bullet points followed by a score out of 10. Keep bullets brief and actionable."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });

      const response = completion.choices[0].message.content;
      
      // Extract score from the response (assuming it's at the end after "Score:" or similar)
      const scoreMatch = response.match(/(\d+)(?:\s*\/\s*10|\s*out of\s*10)/i);
      const score = scoreMatch ? parseInt(scoreMatch[1]) : null;
      
      // Get bullet points (everything before the score)
      const bullets = response
        .split(/score:?\s*\d+(?:\s*\/\s*10|\s*out of\s*10)/i)[0]
        .split(/[•\-\*]\s+/)
        .filter(bullet => bullet.trim())
        .map(bullet => bullet.trim());

      res.json({ 
        bullets,
        score,
        rawFeedback: response 
      });
    } catch (error: any) {
      console.error("Error getting feedback:", error);
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}