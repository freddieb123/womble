import { db } from "@/db";
import { chatConfigs, quizQuestions } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { Router } from "express";

const router = Router();

router.get("/chat-configs/:id", async (req, res) => {
  try {
    console.log('Fetching chat config with ID:', req.params.id);
    const configId = parseInt(req.params.id);
    const config = await db.query.chatConfigs.findFirst({
      where: eq(chatConfigs.id, configId),
    });

    if (!config) {
      return res.status(404).json({ error: "Config not found" });
    }

    // If it's a quiz type, fetch the associated questions
    if (config.type === 'quiz') {
      console.log('Fetching quiz questions for config:', configId);
      const questions = await db.query.quizQuestions.findMany({
        where: and(
          eq(quizQuestions.configId, configId),
          eq(quizQuestions.deleted, false)
        ),
        orderBy: [desc(quizQuestions.orderIndex)]
      });

      console.log('Found questions:', questions);

      const transformedQuestions = questions.map(q => ({
        questionText: q.question,
        idealAnswer: q.expectedAnswer
      }));

      return res.json({
        ...config,
        questions: transformedQuestions
      });
    }

    res.json(config);
  } catch (error) {
    console.error("Error fetching chat config:", error);
    res.status(500).json({ error: "Failed to fetch chat config" });
  }
});

export default router;