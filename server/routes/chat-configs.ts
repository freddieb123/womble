import { db } from "../../db";
import { chatConfigs, quizQuestions } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { Router } from "express";

const router = Router();

// Template route handler
router.post("/:id/template", async (req, res) => {
  try {
    const configId = parseInt(req.params.id);
    const { templateDescription } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    console.log('Saving config as template:', { configId, userId, templateDescription });

    // Update config to be a template but maintain its user association
    const updatedConfig = await db.update(chatConfigs)
      .set({ 
        isTemplate: true,
        templateDescription
      })
      .where(and(
        eq(chatConfigs.id, configId),
        eq(chatConfigs.userId, userId)
      ))
      .returning();

    if (!updatedConfig || updatedConfig.length === 0) {
      return res.status(404).json({ error: "Configuration not found or unauthorized" });
    }

    console.log('Updated config:', updatedConfig[0]);
    res.json(updatedConfig[0]);
  } catch (error) {
    console.error("Error saving as template:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

// Single config fetch route
router.get("/:id", async (req, res) => {
  try {
    console.log('Fetching chat config with ID:', req.params.id);
    const configId = parseInt(req.params.id);
    const userId = req.user?.id;
    console.log('User ID from request:', userId);

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
      console.log('No config found for ID:', configId);
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