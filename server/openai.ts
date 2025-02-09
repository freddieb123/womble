import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function compareQuizAnswer(correctAnswer: string, userAnswer: string, questionContext: string): Promise<{
  isCorrect: boolean;
  partiallyCorrect: boolean;
  explanation: string;
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert at comparing quiz answers. You'll be given the correct answer and a user's answer.
          Compare them for semantic similarity and meaning, not just exact matches. Return a JSON response with:
          - isCorrect: true if the answer is completely correct
          - partiallyCorrect: true if the answer captures some key points but misses others
          - explanation: brief explanation of what was correct/incorrect`
        },
        {
          role: "user",
          content: `Question context: ${questionContext}
          Correct answer: ${correctAnswer}
          User answer: ${userAnswer}

          Analyze if these answers match in meaning and return JSON.`
        }
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || '{"isCorrect": false, "partiallyCorrect": false, "explanation": "Failed to analyze answer"}');
    return {
      isCorrect: result.isCorrect,
      partiallyCorrect: result.partiallyCorrect,
      explanation: result.explanation
    };
  } catch (error) {
    console.error('Error comparing quiz answers:', error);
    throw new Error('Failed to compare answers');
  }
}