import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { AdminConfig } from "@/lib/types";
import UserNameModal from "./UserNameModal";

interface QuizQuestion {
  question: string;
  expectedAnswer: string;
}

interface Props {
  config: AdminConfig;
  sessionId: string;
  userName: string | null;
  isViewOnly: boolean;
  onUserNameSubmit: (name: string) => string;
}

type FeedbackStatus = 'correct' | 'almost' | 'incorrect';
type FeedbackEntry = { status: FeedbackStatus; feedback: string };
type FeedbackState = Record<number, FeedbackEntry>;

export default function QuizInterface({ config, sessionId, userName, isViewOnly, onUserNameSubmit }: Props) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNameModal, setShowNameModal] = useState(!isViewOnly && !userName);
  const { toast } = useToast();

  const handleAnswerChange = (index: number, value: string) => {
    setAnswers(prev => ({
      ...prev,
      [index]: value
    }));
  };

  const questions = config.questions as QuizQuestion[] | undefined;

  // Check if all questions have been answered
  const areAllQuestionsAnswered = questions && 
    questions.every((_, index) => answers[index]?.trim().length > 0);

  const handleSubmit = async () => {
    if (!questions || !userName) return;

    setIsSubmitting(true);
    try {
      console.log("Submitting quiz with data:", {
        configId: config.id,
        sessionId,
        userName,
        questions,
        answers: Object.entries(answers).map(([index, answer]) => ({
          questionIndex: parseInt(index),
          answer,
          expectedAnswer: questions[parseInt(index)].expectedAnswer
        }))
      });

      const response = await fetch("/api/quiz-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          configId: config.id,
          sessionId,
          userName,
          questions,
          answers: Object.entries(answers).map(([index, answer]) => ({
            questionIndex: parseInt(index),
            answer,
            expectedAnswer: questions[parseInt(index)].expectedAnswer
          }))
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || "Failed to submit quiz");
      }

      setFeedback(data);
    } catch (error) {
      console.error("Quiz submission error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit quiz. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!questions) {
    return (
      <div className="p-6 text-center text-red-600">
        No questions available for this quiz
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {showNameModal && (
        <UserNameModal
          open={showNameModal}
          onSubmit={(name) => {
            onUserNameSubmit(name);
            setShowNameModal(false);
          }}
        />
      )}
      {questions.map((question, index) => (
        <Card key={index} className={`p-6 ${
          feedback?.[index] 
            ? `border-2 border-${getFeedbackColor(feedback[index]?.status)}-500` 
            : !answers[index]?.trim() 
              ? 'border-2 border-yellow-200' 
              : ''
        }`}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-lg font-semibold">Question {index + 1}</Label>
              <p className="text-gray-700">{question.question}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`answer-${index}`}>Your Answer</Label>
              <Textarea
                id={`answer-${index}`}
                value={answers[index] || ""}
                onChange={(e) => handleAnswerChange(index, e.target.value)}
                placeholder="Type your answer here..."
                disabled={feedback !== null || isViewOnly}
                className={!answers[index]?.trim() ? 'border-yellow-200' : ''}
              />
              {!answers[index]?.trim() && !feedback && !isViewOnly && (
                <p className="text-sm text-yellow-600">Please provide an answer</p>
              )}
            </div>
            {feedback?.[index] && (
              <div className={`p-4 rounded-md bg-${getFeedbackColor(feedback[index].status)}-100`}>
                <p className={`font-semibold capitalize text-${getFeedbackColor(feedback[index].status)}-700`}>
                  {feedback[index].status}
                </p>
                <p className="mt-1 text-sm text-gray-700">{feedback[index].feedback}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      {!isViewOnly && (
        <div className="flex justify-end">
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || feedback !== null || !areAllQuestionsAnswered || !userName}
          >
            {isSubmitting ? "Submitting..." : areAllQuestionsAnswered ? "Submit Quiz" : "Answer all questions to submit"}
          </Button>
        </div>
      )}
    </div>
  );
}

function getFeedbackColor(status: FeedbackStatus | undefined): string {
  switch (status) {
    case 'correct':
      return 'green';
    case 'almost':
      return 'yellow';
    case 'incorrect':
      return 'red';
    default:
      return 'gray';
  }
}