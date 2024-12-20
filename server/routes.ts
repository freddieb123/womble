import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { chatConfigs, conversations } from "@db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";
import crypto from 'crypto';
import OpenAI from 'openai';

export function registerRoutes(app: Express): Server {
  app.get("/api/chat-configs", async (_req, res) => {
    try {
      const configs = await db
        .select({
          id: chatConfigs.id,
          title: chatConfigs.title,
          systemPrompt: chatConfigs.systemPrompt,
          userInstructions: chatConfigs.userInstructions,
          feedbackCriteria: chatConfigs.feedbackCriteria,
          createdAt: chatConfigs.createdAt,
          lastUsedAt: sql<string>`
            COALESCE(
              (
                SELECT created_at::timestamp
                FROM ${conversations}
                WHERE config_id = ${chatConfigs.id}
                ORDER BY created_at DESC
                LIMIT 1
              ),
              ${chatConfigs.createdAt}::timestamp
            )
          `.as('last_used_at')
        })
        .from(chatConfigs)
        .orderBy(desc(sql`last_used_at`));

      res.json(configs);
    } catch (error: any) {
      console.error("Error fetching chat configs:", error);
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}