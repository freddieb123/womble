import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AdminConfig } from "@/lib/types";

interface QuizResponse {
  sessionId: string;
  userName: string;
  answers: Record<number, {
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

  return (
    <div className="space-y-6">
      {config.questions.map((question, qIndex) => (
        <Card key={qIndex} className="overflow-hidden">
          <div 
            className="p-4 bg-gray-50 flex justify-between items-center cursor-pointer"
            onClick={() => toggleQuestion(qIndex)}
          >
            <div>
              <h3 className="font-medium">Question {qIndex + 1}</h3>
              <p className="text-sm text-gray-600">{question.question}</p>
            </div>
            <Button variant="ghost" size="sm">
              {expandedQuestions.includes(qIndex) ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>

          {expandedQuestions.includes(qIndex) && (
            <CardContent className="p-4">
              <div className="space-y-4">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="font-medium text-blue-700">Expected Answer:</p>
                  <p className="text-blue-600">{question.expectedAnswer}</p>
                </div>

                <div className="space-y-3">
                  {responses.map((response, rIndex) => {
                    const answer = response.answers[qIndex];
                    if (!answer) return null;

                    return (
                      <div 
                        key={rIndex}
                        className={`p-3 border rounded-md ${getStatusColor(answer.status)}`}
                      >
                        <div className="flex justify-between mb-2">
                          <span className="font-medium">{response.userName}</span>
                          <span className="capitalize">{answer.status}</span>
                        </div>
                        <p className="mb-2">{answer.answer}</p>
                        <p className="text-sm italic">{answer.feedback}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}
