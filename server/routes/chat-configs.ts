import { db } from "../../db";
import { chatConfigs, quizQuestions } from "../../db/schema";
import { eq } from "drizzle-orm";
import { Router } from "express";

const router = Router();

router.get("/chat-configs/:id", async (req, res) => {
  try {
    console.log('Fetching chat config with ID:', req.params.id);
    const configId = parseInt(req.params.id);
    const config = await db.query.chatConfigs.findFirst({
      where: eq(chatConfigs.id, configId),
      with: {
        quizQuestions: {
          where: eq(quizQuestions.deleted, false),
          orderBy: [quizQuestions.orderIndex],
        }
      }
    });

    if (!config) {
      return res.status(404).json({ error: "Configuration not found" });
    }

    // Transform the response to match the expected format
    const responseConfig = {
      ...config,
      questions: config.type === 'quiz' ? config.quizQuestions.map(q => ({
        question: q.question,
        expectedAnswer: q.expectedAnswer
      })) : undefined,
      quizQuestions: config.type === 'quiz' ? config.quizQuestions : undefined
    };

    console.log('Sending response config:', responseConfig);
    res.json(responseConfig);
  } catch (error: any) {
    console.error("Error fetching chat config:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;