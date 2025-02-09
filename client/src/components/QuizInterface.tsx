import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminConfig } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Check, X, AlertCircle } from "lucide-react";
import UserNameModal from "./UserNameModal";
import { useMutation } from "@tanstack/react-query";

interface Props {
  config: AdminConfig;
  sessionId: string;
  userName: string | null;
  onUserNameSubmit: (name: string) => void;
}

interface QuizResponse {
  questionId: number;
  answer: string;
}

interface QuizFeedback {
  responses: {
    questionId: number;
    isCorrect: boolean;
    partiallyCorrect: boolean;
    explanation: string;
  }[];
  overallScore: number;
}

export default function QuizInterface({ config, sessionId, userName, onUserNameSubmit }: Props) {
  const [currentAnswers, setCurrentAnswers] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState<QuizFeedback | null>(null);
  const [showNameModal, setShowNameModal] = useState(!userName);
  const { toast } = useToast();

  const submitQuizMutation = useMutation({
    mutationFn: async (answers: QuizResponse[]) => {
      const response = await fetch(`/api/quiz-responses/${config.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          userName,
          answers,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit quiz");
      }

      return response.json();
    },
    onSuccess: (data: QuizFeedback) => {
      setFeedback(data);
      toast({
        description: "Quiz submitted successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const handleSubmit = () => {
    if (!userName) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter your name before submitting",
      });
      setShowNameModal(true);
      return;
    }

    if (!config.quizQuestions?.length) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No questions available",
      });
      return;
    }

    const answers = Object.entries(currentAnswers).map(([questionId, answer]) => ({
      questionId: parseInt(questionId),
      answer,
    }));

    submitQuizMutation.mutate(answers);
  };

  if (!config.quizQuestions?.length) {
    return (
      <div className="p-4">
        <p>No questions available for this quiz.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showNameModal && (
        <UserNameModal
          open={showNameModal}
          onSubmit={(name) => {
            onUserNameSubmit(name);
            setShowNameModal(false);
          }}
        />
      )}

      <div>
        <h2 className="text-2xl font-bold mb-2">{config.title}</h2>
        {config.userInstructions && (
          <p className="text-muted-foreground mb-6">{config.userInstructions}</p>
        )}
      </div>

      <div className="space-y-6">
        {config.quizQuestions.map((question, index) => (
          <Card key={question.id}>
            <CardHeader>
              <CardTitle className="text-lg">Question {index + 1}</CardTitle>
              <CardDescription>{question.question}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Input
                  value={currentAnswers[question.id] || ""}
                  onChange={(e) =>
                    setCurrentAnswers((prev) => ({
                      ...prev,
                      [question.id]: e.target.value,
                    }))
                  }
                  placeholder="Enter your answer..."
                  disabled={!!feedback}
                />

                {feedback && (
                  <div className={`p-4 rounded-lg ${
                    feedback.responses[index].isCorrect
                      ? "bg-green-50 border border-green-200"
                      : feedback.responses[index].partiallyCorrect
                      ? "bg-yellow-50 border border-yellow-200"
                      : "bg-red-50 border border-red-200"
                  }`}>
                    <div className="flex items-start gap-2">
                      {feedback.responses[index].isCorrect ? (
                        <Check className="h-5 w-5 text-green-600 mt-0.5" />
                      ) : feedback.responses[index].partiallyCorrect ? (
                        <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                      ) : (
                        <X className="h-5 w-5 text-red-600 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium mb-1">
                          {feedback.responses[index].isCorrect
                            ? "Correct!"
                            : feedback.responses[index].partiallyCorrect
                            ? "Partially Correct"
                            : "Incorrect"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {feedback.responses[index].explanation}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {feedback ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-lg font-semibold mb-2">
                Overall Score: {feedback.overallScore}%
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={submitQuizMutation.isPending}
        >
          Submit Quiz
        </Button>
      )}
    </div>
  );
}