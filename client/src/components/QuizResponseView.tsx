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

  // Group all responses by question
  const questionResponses: Record<number, Array<{
    userName: string;
    answer: string;
    status: string;
    feedback: string;
  }>> = {};

  config.questions.forEach((_, qIndex) => {
    questionResponses[qIndex] = responses.map(response => ({
      userName: response.userName,
      ...response.answers[qIndex] || {
        answer: 'No answer provided',
        status: 'incorrect',
        feedback: 'No response received'
      }
    }));
  });

  return (
    <div className="space-y-4">
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
                {questionResponses[qIndex].length} responses
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
                      <p className="mb-2 text-gray-700">{response.answer}</p>
                      <p className="text-sm italic">{response.feedback}</p>
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