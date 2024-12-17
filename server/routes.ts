import type { Express } from "express";
import { createServer, type Server } from "http";
import OpenAI from "openai";
import { z } from "zod";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Store messages per session
const sessions: Record<string, {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
}[]> = {};

function getSessionId(req: Express.Request): string {
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
  app.get("/api/messages", (req, res) => {
    const sessionId = getSessionId(req);
    const sessionMessages = sessions[sessionId] || [];
    res.json({
      messages: sessionMessages,
      isLoading: false,
      error: null
    });
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
    } catch (error) {
      console.error("Error processing message:", error);
      res.status(500).send(error.message);
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
