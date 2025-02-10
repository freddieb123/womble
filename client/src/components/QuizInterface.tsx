import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { AdminConfig, QuizQuestion } from "@/lib/types";
import UserNameModal from "./UserNameModal";

interface Props {
  config: AdminConfig;
  sessionId: string;
  userName: string | null;
  onUserNameSubmit: (name: string) => void;
}

interface QuizAnswer {
  questionId: string;
  selectedAnswer: string;
}

export default function QuizInterface({ config, sessionId, userName, onUserNameSubmit }: Props) {
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<any>(null);
  const { toast } = useToast();

  const submitQuiz = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/quiz-submit?configId=${config.id}&sessionId=${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          answers,
          userName
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit quiz');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setFeedback(data);
      setIsSubmitted(true);
      toast({
        description: "Quiz submitted successfully!",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit quiz",
      });
    },
  });

  const handleAnswer = (questionId: string, answer: string) => {
    setAnswers(prev => {
      const existing = prev.find(a => a.questionId === questionId);
      if (existing) {
        return prev.map(a => a.questionId === questionId ? { ...a, selectedAnswer: answer } : a);
      }
      return [...prev, { questionId, selectedAnswer: answer }];
    });
  };

  if (!userName) {
    return <UserNameModal onSubmit={onUserNameSubmit} />;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">{config.title}</h2>
        {config.userInstructions && (
          <p className="text-muted-foreground whitespace-pre-wrap">
            {config.userInstructions}
          </p>
        )}
      </div>

      {!isSubmitted ? (
        <div className="space-y-8">
          {config.quizQuestions?.map((question: QuizQuestion, index: number) => (
            <Card key={question.id} className="p-6">
              <div className="space-y-4">
                <h3 className="font-medium">Question {index + 1}: {question.question}</h3>
                <RadioGroup
                  value={answers.find(a => a.questionId === question.id)?.selectedAnswer}
                  onValueChange={(value) => handleAnswer(question.id, value)}
                >
                  {question.options.map((option, optionIndex) => (
                    <div key={optionIndex} className="flex items-center space-x-2">
                      <RadioGroupItem value={option} id={`${question.id}-${optionIndex}`} />
                      <Label htmlFor={`${question.id}-${optionIndex}`}>{option}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </Card>
          ))}

          <Button
            className="w-full"
            onClick={() => submitQuiz.mutate()}
            disabled={answers.length !== (config.quizQuestions?.length || 0)}
          >
            Submit Quiz
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="p-6">
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Quiz Results</h3>
              <div className="grid gap-2">
                <div className="flex justify-between items-center">
                  <span>Score:</span>
                  <span className="font-semibold">{feedback.score}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Correct Answers:</span>
                  <span className="text-green-600">{feedback.correctAnswers}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Almost Correct:</span>
                  <span className="text-yellow-600">{feedback.almostCorrect}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Wrong Answers:</span>
                  <span className="text-red-600">{feedback.wrongAnswers}</span>
                </div>
              </div>
              {feedback.feedback && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <p className="text-sm whitespace-pre-wrap">{feedback.feedback}</p>
                </div>
              )}
            </div>
          </Card>

          <div className="space-y-6">
            {config.quizQuestions?.map((question: QuizQuestion, index: number) => {
              const userAnswer = answers.find(a => a.questionId === question.id);
              const result = feedback.answers.find((a: any) => a.questionId === question.id);
              
              return (
                <Card key={question.id} className="p-6">
                  <div className="space-y-4">
                    <h3 className="font-medium">Question {index + 1}: {question.question}</h3>
                    <div className="space-y-2">
                      {question.options.map((option, optionIndex) => {
                        const isSelected = userAnswer?.selectedAnswer === option;
                        const isCorrect = question.correctAnswer === option;
                        
                        return (
                          <div
                            key={optionIndex}
                            className={`p-2 rounded-lg ${
                              isSelected
                                ? result?.grade === 'correct'
                                  ? 'bg-green-100'
                                  : result?.grade === 'almost'
                                  ? 'bg-yellow-100'
                                  : 'bg-red-100'
                                : isCorrect
                                ? 'bg-green-50'
                                : ''
                            }`}
                          >
                            <Label>{option}</Label>
                          </div>
                        );
                      })}
                    </div>
                    {question.explanation && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        <strong>Explanation:</strong> {question.explanation}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
