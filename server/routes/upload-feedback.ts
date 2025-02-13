import OpenAI from "openai";
import { z } from "zod";
import { db } from "@db/index";
import { conversations, feedback } from "@db/schema";
import { eq } from "drizzle-orm";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
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

    // Remove data URL prefix if present
    const base64Image = fileContent.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');

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
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`
            }
          }
        ]
      }
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      response_format: { type: "json_object" }
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
      details: error.message 
    });
  }
}
