import OpenAI from "openai";
import { z } from "zod";
import { db } from "@db/index";
import { conversations, feedback, chatConfigs } from "@db/schema";
import { eq } from "drizzle-orm";

const openai = new OpenAI();

const uploadSchema = z.object({
  configId: z.number(),
  sessionId: z.string(),
  userName: z.string(),
  fileContent: z.string(),
  fileName: z.string()
});

export async function POST(req, res) {
  try {
    const { configId, sessionId, userName, fileContent, fileName } = uploadSchema.parse(req.body);

    // Get the chat config to access the feedback criteria
    const chatConfig = await db.query.chatConfigs.findFirst({
      where: eq(chatConfigs.id, configId)
    });

    if (!chatConfig) {
      return res.status(404).json({ error: "Chat configuration not found" });
    }

    // Remove data URL prefix if present and ensure proper base64 encoding
    const base64Image = fileContent.replace(/^data:image\/[a-z]+;base64,/, '');

    const messages = [
      {
        role: "system",
        content: `You are an expert at analyzing screenshots and providing feedback. ${chatConfig.feedbackCriteria}

        Analyze the screenshot in detail and provide feedback in JSON format with these fields:
        {
          "bullets": string[], // Array of specific feedback points
          "score": number, // Score out of 10
          "summary": string // Brief overall assessment
        }

        Make the feedback constructive and actionable.`
      },
      {
        role: "user",
        content: [
          { 
            type: "text", 
            text: "Please analyze this screenshot and provide detailed feedback."
          },
          {
            type: "image_url",
            image_url: {
              url: fileContent.startsWith('data:') ? fileContent : `data:image/png;base64,${base64Image}`
            }
          }
        ]
      }
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages,
      max_tokens: 1000,
      temperature: 0.7,
    });

    const feedbackContent = JSON.parse(response.choices[0].message.content);

    // Save the conversation and feedback
    const [conversation] = await db
      .insert(conversations)
      .values({
        configId,
        sessionId,
        userName
      })
      .returning();

    await db.insert(feedback).values({
      conversationId: conversation.id,
      content: feedbackContent
    });

    return res.json(feedbackContent);
  } catch (error) {
    console.error('Error processing upload:', error);
    return res.status(500).json({ 
      error: "Failed to analyze upload", 
      details: error instanceof Error ? error.message : String(error)
    });
  }
}