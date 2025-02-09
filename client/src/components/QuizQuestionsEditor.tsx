import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface QuizQuestion {
  question: string;
  recommendedAnswer: string;
}

interface Props {
  questions: QuizQuestion[];
  onChange: (questions: QuizQuestion[]) => void;
}

export default function QuizQuestionsEditor({ questions, onChange }: Props) {
  const addQuestion = () => {
    onChange([...questions, { question: "", recommendedAnswer: "" }]);
  };

  const updateQuestion = (index: number, field: keyof QuizQuestion, value: string) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], [field]: value };
    onChange(newQuestions);
  };

  const removeQuestion = (index: number) => {
    const newQuestions = questions.filter((_, i) => i !== index);
    onChange(newQuestions);
  };

  return (
    <div className="space-y-6">
      <ScrollArea className="h-[400px] pr-4">
        {questions.map((q, index) => (
          <div key={index} className="mb-6 p-4 border rounded-lg relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2"
              onClick={() => removeQuestion(index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            
            <div className="space-y-4">
              <div>
                <Label>Question {index + 1}</Label>
                <Textarea
                  value={q.question}
                  onChange={(e) => updateQuestion(index, "question", e.target.value)}
                  placeholder="Enter your question..."
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label>Recommended Answer</Label>
                <Textarea
                  value={q.recommendedAnswer}
                  onChange={(e) => updateQuestion(index, "recommendedAnswer", e.target.value)}
                  placeholder="Enter the recommended answer..."
                  className="mt-1"
                />
              </div>
            </div>
          </div>
        ))}
      </ScrollArea>
      
      <Button onClick={addQuestion} className="w-full">
        <Plus className="h-4 w-4 mr-2" />
        Add Question
      </Button>
    </div>
  );
}
