import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AdminConfig } from "@/lib/types";

interface QuizResponse {
  sessionId: string;
  userName: string;
  feedback: Record<number, {
    status: 'correct' | 'almost' | 'incorrect';
    feedback: string;
    answer: string;
  }>;
}

interface Props {
  config: AdminConfig;
  responses: QuizResponse[];
}

function getStatusColor(status: string) {
  switch (status) {
    case 'correct':
      return 'text-green-600 bg-green-50 border-green-200';
    case 'almost':
      return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    case 'incorrect':
      return 'text-red-600 bg-red-50 border-red-200';
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200';
  }
}

function calculateScore(feedback: QuizResponse['feedback'], totalQuestions: number) {
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
}

function getScoreMessage(percentage: number): string {
  if (percentage >= 90) return "Excellent!";
  if (percentage >= 80) return "Great job!";
  if (percentage >= 70) return "Good work!";
  if (percentage >= 60) return "Keep practicing!";
  return "More practice needed";
}

export default function QuizResponseView({ config, responses }: Props) {
  const [expandedQuestions, setExpandedQuestions] = useState<number[]>([]);

  const toggleQuestion = (index: number) => {
    setExpandedQuestions(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  if (!config.questions || config.questions.length === 0) {
    return <div className="p-4 text-center text-gray-500">No questions found in this quiz</div>;
  }

  // Calculate overall statistics and sort by score (highest first)
  const overallStats = responses.map(response => {
    const score = calculateScore(response.feedback, config.questions!.length);
    return {
      userName: response.userName || 'Anonymous',
      ...score
    };
  }).sort((a, b) => b.score - a.score); // Sort by score in descending order

  // Group all responses by question
  const questionResponses: Record<number, Array<{
    userName: string;
    answer?: string;
    status: string;
    feedback: string;
  }>> = {};

  config.questions.forEach((_, qIndex) => {
    questionResponses[qIndex] = responses.map(response => ({
      userName: response.userName || 'Anonymous',
      ...response.feedback[qIndex] || {
        answer: 'No answer provided',
        status: 'incorrect',
        feedback: 'No response received'
      }
    }));
  });

  return (
    <div className="space-y-4">
      {/* Overall Statistics Card */}
      <Card className="p-4 bg-blue-50">
        <CardContent>
          <h2 className="text-xl font-semibold text-blue-900 mb-4">Quiz Results Overview</h2>
          <div className="space-y-3">
            {overallStats.map((stat, index) => (
              <div key={index} className="flex justify-between items-center p-2 bg-white rounded-lg shadow-sm">
                <span className="font-medium">{stat.userName}</span>
                <span className="font-bold text-blue-600">
                  {stat.score}/{stat.total}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {config.questions.map((question, qIndex) => (
        <Card key={qIndex} className="overflow-hidden">
          <div 
            className="p-4 bg-gray-50 flex justify-between items-center cursor-pointer"
            onClick={() => toggleQuestion(qIndex)}
          >
            <div className="flex-1">
              <h3 className="font-medium">Question {qIndex + 1}</h3>
              <p className="text-sm text-gray-600">{question.question}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-500">
                {questionResponses[qIndex].filter(r => r.status === 'correct').length}/{questionResponses[qIndex].length} correct
              </div>
              <Button variant="ghost" size="sm">
                {expandedQuestions.includes(qIndex) ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {expandedQuestions.includes(qIndex) && (
            <CardContent className="p-4">
              <div className="space-y-4">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="font-medium text-blue-700">Expected Answer:</p>
                  <p className="text-blue-600">{question.expectedAnswer}</p>
                </div>

                <div className="space-y-3">
                  {questionResponses[qIndex].map((response, rIndex) => (
                    <div 
                      key={rIndex}
                      className={`p-3 border rounded-md ${getStatusColor(response.status)}`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">{response.userName}</span>
                        <span className="px-2 py-1 rounded text-sm capitalize font-medium">
                          {response.status}
                        </span>
                      </div>
                      <p className="text-gray-700">{response.answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}