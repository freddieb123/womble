import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { AdminConfig } from "@/lib/types";
import UserNameModal from "./UserNameModal";
import LeaderboardModal from "./LeaderboardModal";
import { Trophy, ChevronLeft, ChevronRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";

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

interface LeaderboardEntry {
  userName: string;
  score: number;
  total: number;
  isCurrentUser: boolean;
}

export default function QuizInterface({ config, sessionId, userName, isViewOnly, onUserNameSubmit }: Props) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localUserName, setLocalUserName] = useState(userName);
  const [showNameModal, setShowNameModal] = useState(!isViewOnly && !localUserName);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<number>();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const { toast } = useToast();

  const handleAnswerChange = (index: number, value: string) => {
    setAnswers(prev => ({
      ...prev,
      [index]: value
    }));
  };

  const questions = config.questions || [];

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

  const goToNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const goToPreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const progressPercentage = ((currentQuestionIndex + 1) / questions.length) * 100;

  const areAllQuestionsAnswered = questions.length > 0 && questions.every((_, index) => {
    const hasAnswer = answers[index]?.trim().length > 0;
    return hasAnswer;
  });

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch(`/api/quiz-responses/${config.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch leaderboard data');
      }

      const data = await response.json();

      const scoredEntries = data.map((entry: any) => {
        const score = Object.values(entry.feedback).reduce((acc: number, curr: any) => {
          if (curr.status === 'correct') return acc + 1;
          if (curr.status === 'almost') return acc + 0.5;
          return acc;
        }, 0);

        return {
          userName: entry.userName || 'Anonymous',
          score,
          total: questions.length,
          isCurrentUser: entry.userName === localUserName
        };
      });

      const sortedEntries = scoredEntries.sort((a: LeaderboardEntry, b: LeaderboardEntry) =>
        b.score - a.score
      );

      const userRankIndex = sortedEntries.findIndex((entry: LeaderboardEntry) => entry.isCurrentUser);
      if (userRankIndex !== -1) {
        setUserRank(userRankIndex + 1);
      }

      setLeaderboardData(sortedEntries);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load leaderboard data",
      });
    }
  };

  const handleSubmit = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

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

      await fetchLeaderboard();

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
  const currentQuestion = questions[currentQuestionIndex];

  return (
    <div className="space-y-8 max-w-3xl mx-auto h-[800px]">
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

      <LeaderboardModal
        open={showLeaderboard}
        onOpenChange={setShowLeaderboard}
        entries={leaderboardData}
        currentUserRank={userRank}
        title="Quiz Leaderboard"
        maxScore={questions.length}
        onRefresh={fetchLeaderboard}
      />

      {feedback && overallScore && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <h2 className="text-2xl font-bold text-blue-900">
                Overall Score: {overallScore?.score} / {overallScore?.total}
              </h2>
              <div className="flex justify-center mt-2">
                <Button
                  onClick={() => {
                    fetchLeaderboard();
                    setShowLeaderboard(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Trophy className="w-4 h-4 mr-2" />
                  View Leaderboard
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!feedback && (
        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Question {currentQuestionIndex + 1} of {questions.length}</span>
            <span className="text-sm text-gray-500">{Math.round(progressPercentage)}% Complete</span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>
      )}

      {feedback ? (
        // Display all questions with feedback
        <div className="space-y-6">
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
                    readOnly
                    className="bg-gray-50"
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
        </div>
      ) : (
        // Display only the current question
        <Card className="p-6 shadow-md">
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xl font-semibold">Question {currentQuestionIndex + 1}</Label>
              <p className="text-gray-700 text-lg">{currentQuestion.question}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`answer-${currentQuestionIndex}`}>Your Answer</Label>
              <Textarea
                id={`answer-${currentQuestionIndex}`}
                value={answers[currentQuestionIndex] || ""}
                onChange={(e) => handleAnswerChange(currentQuestionIndex, e.target.value)}
                placeholder="Type your answer here..."
                className="min-h-[120px]"
                disabled={isViewOnly}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between pt-4">
            <Button
              variant="outline"
              onClick={goToPreviousQuestion}
              disabled={currentQuestionIndex === 0}
              className="flex items-center gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            
            {currentQuestionIndex === questions.length - 1 ? (
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !areAllQuestionsAnswered || !localUserName}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSubmitting ? "Submitting..." : areAllQuestionsAnswered ? "Submit Quiz" : "Answer all questions to submit"}
              </Button>
            ) : (
              <Button
                variant="default"
                onClick={goToNextQuestion}
                className="flex items-center gap-1"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </CardFooter>
        </Card>
      )}

      <footer className="mt-auto py-2 text-center text-xs text-gray-400">
        This page is powered by <a href="https://www.womble.co" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">Womble.co</a> - 
        Providing <a href="https://womble.co" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">AI-powered formative feedback</a> for education
      </footer>
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