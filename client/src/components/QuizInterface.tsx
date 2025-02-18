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
  const [localUserName, setLocalUserName] = useState(userName);
  const [showNameModal, setShowNameModal] = useState(!isViewOnly && !localUserName);
  const { toast } = useToast();

  const handleAnswerChange = (index: number, value: string) => {
    setAnswers(prev => ({
      ...prev,
      [index]: value
    }));
  };

  const questions = config.questions || [];

  // Calculate the overall score when feedback is available
  const calculateOverallScore = () => {
    if (!feedback) return null;

    const totalQuestions = questions.length;
    let score = 0;

    Object.values(feedback).forEach(entry => {
      if (entry.status === 'correct') score += 1;
      else if (entry.status === 'almost') score += 0.5;
    });

    return {
      score,
      total: totalQuestions,
      percentage: (score / totalQuestions) * 100
    };
  };

  // Check if all questions have been answered
  const areAllQuestionsAnswered = questions.length > 0 && questions.every((_, index) => {
    const hasAnswer = answers[index]?.trim().length > 0;
    return hasAnswer;
  });

  const handleSubmit = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    // Validate required data
    if (!Array.isArray(questions) || questions.length === 0) {
      console.error("Questions must be a non-empty array");
      return;
    }

    if (!localUserName) {
      console.error("Username is required");
      return;
    }

    setIsSubmitting(true);
    try {
      // Format the submission data to match the server's expected schema
      const submissionData = {
        configId: config.id,
        sessionId,
        userName: localUserName,
        questions: questions,
        answers: questions.map((q, index) => ({
          questionIndex: index,
          answer: answers[index] || '',
          expectedAnswer: q.expectedAnswer
        }))
      };

      console.log("Prepared submission data:", JSON.stringify(submissionData, null, 2));

      const response = await fetch("/api/quiz-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(submissionData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
        console.error("Server error response:", errorData);
        throw new Error(errorData.error || errorData.details || `Server error: ${response.status}`);
      }

      const data = await response.json();
      console.log("Received feedback data:", data);
      setFeedback(data);

      toast({
        title: "Quiz Submitted",
        description: "Your answers have been submitted successfully!",
      });
    } catch (error) {
      console.error("Quiz submission error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit quiz. Please try again.",
      });
      setFeedback(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!questions || questions.length === 0) {
    return (
      <div className="p-6 text-center text-red-600">
        No questions available for this quiz
      </div>
    );
  }

  const overallScore = calculateOverallScore();

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {showNameModal && (
        <UserNameModal
          open={showNameModal}
          onSubmit={(name) => {
            onUserNameSubmit(name);
            setLocalUserName(name);
            setShowNameModal(false);
          }}
        />
      )}

      {feedback && overallScore && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-blue-900 mb-2">
                Overall Score: {overallScore.score} / {overallScore.total}
              </h2>
              <p className="text-blue-600">
                {overallScore.percentage.toFixed(1)}% - {getScoreMessage(overallScore.percentage)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {questions.map((question, index) => (
        <Card key={index} className={`p-6 ${
          feedback?.[index]
            ? `border-2 border-${getFeedbackColor(feedback[index]?.status)}-500`
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
              />
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
            disabled={isSubmitting || feedback !== null || !areAllQuestionsAnswered || !localUserName}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg"
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

function getScoreMessage(percentage: number): string {
  if (percentage >= 90) return "Excellent!";
  if (percentage >= 80) return "Great job!";
  if (percentage >= 70) return "Good work!";
  if (percentage >= 60) return "Keep practicing!";
  return "More practice needed";
}