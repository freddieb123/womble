import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { chatConfigs, conversations } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
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

// Store conversations by session ID
const sessions: Record<string, any[]> = {};

function getSessionIdFromUrl(req: Request): string {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    throw new Error("No session ID provided in URL");
  }
  return sessionId;
}

const configSchema = z.object({
  systemPrompt: z.string(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().min(100).max(4000)
});


export function registerRoutes(app: Express): Server {
  app.get("/api/messages", async (req: Request, res: Response) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const configId = parseInt(url.searchParams.get("configId") || "");
      const sessionId = url.searchParams.get("sessionId");
      const linkId = url.searchParams.get("linkId");

      if (isNaN(configId) || configId <= 0) {
        console.log("Invalid configId:", configId);
        return res.status(400).json({ error: "Valid config ID is required" });
      }

      console.log('Fetching messages:', { configId, sessionId, linkId });

      // Try to get messages from database first
      let whereClause;
      if (sessionId) {
        // If sessionId is provided, get specific conversation
        whereClause = and(
          eq(conversations.configId, configId),
          eq(conversations.sessionId, sessionId)
        );
      } else if (linkId) {
        // If only linkId is provided, get latest conversation from that group
        whereClause = and(
          eq(conversations.configId, configId),
          eq(conversations.linkId, linkId)
        );
      } else {
        // Fallback to just configId
        whereClause = eq(conversations.configId, configId);
      }

      const conversation = await db.query.conversations.findFirst({
        where: whereClause,
        orderBy: [desc(conversations.createdAt)]
      });

      console.log("Found conversation:", conversation ? "yes" : "no", {
        configId,
        sessionId,
        linkId,
        hasMessages: conversation?.messages ? true : false
      });

      // Initialize or update session with messages from the database
      if (conversation) {
        sessions[sessionId] = typeof conversation.messages === 'string' 
          ? JSON.parse(conversation.messages) 
          : conversation.messages;
        console.log("Loaded existing conversation from database, messages count:", sessions[sessionId].length);
      } else {
        sessions[sessionId] = [];
        console.log("No existing conversation found, initializing empty session:", sessionId);
      }

      const response = {
        messages: sessions[sessionId],
        isLoading: false,
        error: null
      };

      console.log("Returning messages count:", response.messages.length);
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
      const url = new URL(req.url, `http://${req.headers.host}`);
      const configId = parseInt(url.searchParams.get("configId") || "");
      const linkId = url.searchParams.get("linkId") || 'legacy';
      let sessionId = url.searchParams.get("sessionId");
      
      // For new conversations, generate a session ID
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        console.log('Generated new sessionId:', sessionId);
      }
      
      if (!content || typeof content !== "string") {
        return res.status(400).send("Message content is required");
      }

      console.log('Processing message:', { configId, sessionId, linkId });

      if (isNaN(configId) || configId <= 0) {
        return res.status(400).json({ error: "Valid config ID is required" });
      }

      const parsedConfig = configSchema.parse(config);

      console.log('Processing message with sessionId:', sessionId);
      
      // Ensure the sessions object exists and initialize if needed
      if (!sessions[sessionId]) {
        console.log('Initializing new session:', sessionId);
        sessions[sessionId] = [];
      }

      // Create and add user message
      const userMessage = {
        id: crypto.randomUUID(),
        content,
        role: 'user' as const,
        timestamp: Date.now()
      };

      // Add message to session storage
      sessions[sessionId].push(userMessage);
      
      console.log('Added message to session:', {
        sessionId,
        linkId,
        messageId: userMessage.id,
        messageCount: sessions[sessionId].length
      });

      // Save or update conversation in database
        try {
          if (!sessionId) {
            throw new Error("Session ID is required at this point");
          }

          console.log('Saving conversation:', {
            configId,
            sessionId,
            linkId,
            messageCount: sessions[sessionId].length
          });

          // Use the session ID for this chat
          const messagesJson = JSON.stringify(sessions[sessionId]);
          
          // Check if conversation exists
          const existingConversation = await db.query.conversations.findFirst({
            where: and(
              eq(conversations.configId, configId),
              eq(conversations.sessionId, sessionId)
            ),
          });

          if (existingConversation) {
            console.log('Updating existing conversation:', {
              configId,
              sessionId: sessionId,
              linkId,
              messageCount: sessions[sessionId].length,
              messageTypes: sessions[sessionId].map(m => m.role).join(', ')
            });

            await db
              .update(conversations)
              .set({
                messages: messagesJson,
                updatedAt: new Date()
              })
              .where(and(
                eq(conversations.configId, configId),
                eq(conversations.sessionId, sessionId)
              ));
          } else {
            console.log('Creating new conversation:', {
              configId,
              sessionId: sessionId,
              linkId,
              messageCount: sessions[sessionId].length,
              messageTypes: sessions[sessionId].map(m => m.role).join(', ')
            });

            const result = await db
              .insert(conversations)
              .values({
                configId,
                sessionId: sessionId,
                linkId,
                messages: messagesJson,
                createdAt: new Date(),
                updatedAt: new Date()
              })
              .returning();
              
            console.log('Created new conversation with ID:', result[0].id);

          }

          // Verify the save
          const savedConversation = await db.query.conversations.findFirst({
            where: and(
              eq(conversations.configId, configId),
              eq(conversations.sessionId, sessionId)
            ),
          });

          if (!savedConversation) {
            console.error('Failed to verify conversation save:', {
              configId,
              sessionId,
              attempted: true
            });
            throw new Error("Failed to save conversation - verification failed");
          }

          const savedMessages = typeof savedConversation.messages === 'string' 
            ? JSON.parse(savedConversation.messages) 
            : savedConversation.messages;

          console.log('Successfully verified saved conversation:', {
            id: savedConversation.id,
            sessionId: savedConversation.sessionId,
            configId: savedConversation.configId,
            messageCount: Array.isArray(savedMessages) ? savedMessages.length : 0,
            lastMessage: Array.isArray(savedMessages) && savedMessages.length > 0 
              ? { role: savedMessages[savedMessages.length - 1].role } 
              : null
          });
        } catch (error) {
          console.error("Error saving conversation:", {
            error,
            configId,
            sessionId,
            messageCount: sessions[sessionId]?.length
          });
        }

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

      // Save the complete conversation with the assistant's response
      try {
        const messagesJson = JSON.stringify(sessions[sessionId]);
        await db
          .update(conversations)
          .set({
            messages: messagesJson,
            updatedAt: new Date() // Add this if you have an updatedAt column
          })
          .where(and(
            eq(conversations.configId, configId),
            eq(conversations.sessionId, sessionId)
          ));
        
        console.log('Saved completed conversation:', {
          sessionId,
          messageCount: sessions[sessionId].length,
          lastMessage: { role: 'assistant' }
        });
      } catch (error) {
        console.error("Error saving completed conversation:", error);
      }

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
      const { feedbackCriteria } = req.body;
      const url = new URL(req.url, `http://${req.headers.host}`);
      const sessionId = url.searchParams.get("sessionId");
      const configId = parseInt(url.searchParams.get("configId") || "0");

      if (!sessionId) {
        return res.status(400).json({ error: "Session ID is required in URL" });
      }

      console.log('Received feedback request:', { feedbackCriteria, configId, sessionId });

      if (!feedbackCriteria) {
        return res.status(400).json({ error: "Feedback criteria is required" });
      }

      // Fetch the conversation from database
      const conversation = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.configId, configId),
          eq(conversations.sessionId, sessionId)
        ),
      });

      if (!conversation) {
        return res.status(400).json({ error: "Conversation not found" });
      }

      const messagesToAnalyze = typeof conversation.messages === 'string' 
        ? JSON.parse(conversation.messages)
        : conversation.messages;

      if (!Array.isArray(messagesToAnalyze) || messagesToAnalyze.length === 0) {
        return res.status(400).json({ error: "No chat messages to analyze" });
      }

      // Remove duplicate conversation check since we already have it above

      const prompt = `Analyze the user's interactions in this conversation based on these criteria: ${feedbackCriteria}

Please provide your feedback in exactly this format:

• [2-4 bullet points focusing ONLY on the user's communication style and how well they met the criteria]

Score: [1-10]
[Brief one-line summary of overall performance]

Chat transcript:
${messagesToAnalyze.map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join('\n')}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { 
            role: "system", 
            content: "You are an expert at evaluating user communication. Focus solely on the user's messages and interactions, ignoring the AI assistant's responses. Address the user directly using 'you' in your feedback. For example: 'You maintained clear communication' instead of 'The user maintained clear communication'. Keep feedback points brief, clear, and actionable. Always follow the exact format specified, with 2-4 bullet points followed by a score and one-line summary."
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
      
      // Extract score and summary
      const scoreMatch = response.match(/Score:\s*(\d+)/i);
      const score = scoreMatch ? parseInt(scoreMatch[1]) : null;
      
      // Extract summary (the line after the score)
      const summaryMatch = response.match(/Score:\s*\d+\s*\n([^\n]+)/i);
      const summary = summaryMatch ? summaryMatch[1].trim() : null;
      
      // Get bullet points (everything before "Score:")
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
        // Update feedback in database
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

  app.get("/api/conversations/:configId", async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.configId);
      const sessionId = req.query.sessionId as string;
      const linkId = req.query.linkId as string;
      
      console.log('Fetching conversations for:', { configId, sessionId, linkId });
      
      if (isNaN(configId)) {
        console.log('Invalid configId:', configId);
        return res.status(400).json({ error: "Invalid config ID" });
      }

      // Build the where clause based on provided parameters
      let whereClause;
      
      if (sessionId) {
        // If sessionId is provided, fetch that specific conversation
        whereClause = and(
          eq(conversations.configId, configId),
          eq(conversations.sessionId, sessionId)
        );
        console.log('Fetching specific conversation for sessionId:', sessionId);
      } else if (linkId) {
        // If linkId is provided, fetch all conversations in that group
        whereClause = and(
          eq(conversations.configId, configId),
          eq(conversations.linkId, linkId)
        );
        console.log('Fetching all conversations for linkId:', linkId);
      } else {
        // Otherwise, fetch all conversations for this config
        whereClause = eq(conversations.configId, configId);
        console.log('Fetching all conversations for configId:', configId);
      }

      console.log('Query parameters:', {
        configId,
        sessionId,
        hasSessionFilter: !!sessionId,
        whereClause
      });

      // First try to find the exact conversation if sessionId is provided
      if (sessionId) {
        const conversation = await db.query.conversations.findFirst({
          where: and(
            eq(conversations.configId, configId),
            eq(conversations.sessionId, sessionId)
          ),
        });

        if (!conversation) {
          console.log('No conversation found for session:', sessionId);
          return res.status(404).json({ error: "Conversation not found" });
        }

        // Parse messages and return single conversation
        try {
          const messages = typeof conversation.messages === 'string' 
            ? JSON.parse(conversation.messages) 
            : conversation.messages;

          return res.json([{
            sessionId: conversation.sessionId,
            messages,
            createdAt: conversation.createdAt,
            feedback: conversation.feedback
          }]);
        } catch (error) {
          console.error('Error parsing conversation messages:', error);
          return res.status(500).json({ error: "Failed to parse conversation data" });
        }
      }

      // If no sessionId, get all conversations for the config
      const savedConversations = await db.query.conversations.findMany({
        where: eq(conversations.configId, configId),
        orderBy: [desc(conversations.createdAt)]
      });

      console.log('Found conversations:', savedConversations.length);

      if (savedConversations.length === 0) {
        console.log('No conversations found for config:', configId);
        return res.json([]);
      }

      const conversationMessages = savedConversations.map(conv => {
        let messages;
        try {
          if (typeof conv.messages === 'string') {
            // First try parsing as is
            try {
              messages = JSON.parse(conv.messages);
            } catch {
              // If that fails, try handling double-escaped JSON
              const unescaped = conv.messages
                .replace(/^""|""$/g, '') // Remove leading/trailing double quotes
                .replace(/\\"/g, '"')     // Replace escaped quotes
                .replace(/\\\\/g, '\\');  // Replace double backslashes
              messages = JSON.parse(unescaped);
            }
          } else {
            messages = conv.messages;
          }

          if (!Array.isArray(messages)) {
            console.error(`Invalid messages format for session ${conv.sessionId}:`, messages);
            messages = [];
          }

          console.log(`Successfully processed conversation ${conv.sessionId}:`, { 
            messageCount: messages.length,
            sampleMessage: messages.length > 0 ? {
              id: messages[0].id,
              role: messages[0].role,
              contentPreview: messages[0].content.substring(0, 50)
            } : null
          });
        } catch (error) {
          console.error(`Error processing messages for session ${conv.sessionId}:`, error);
          messages = [];
        }
        return {
          sessionId: conv.sessionId,
          messages,
          createdAt: conv.createdAt
        };
      });
      
      console.log('Returning processed conversations:', conversationMessages.length);
      res.json(conversationMessages);
    } catch (error: any) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}