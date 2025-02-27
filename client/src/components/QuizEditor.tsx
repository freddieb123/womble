import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import type { AdminConfig } from "@/lib/types";

interface Props {
  config: AdminConfig;
  onConfigChange: (config: AdminConfig) => void;
}

export default function QuizEditor({ config, onConfigChange }: Props) {
  // Ensure questions array exists
  const questions = config.questions || [];

  const handleQuestionChange = (index: number, field: 'question' | 'howToAssess', value: string) => {
    const newQuestions = [...questions];
    newQuestions[index] = {
      ...newQuestions[index],
      [field]: value
    };
    onConfigChange({
      ...config,
      questions: newQuestions
    });
  };

  const addQuestion = () => {
    onConfigChange({
      ...config,
      questions: [...questions, { question: '', howToAssess: '' }]
    });
  };

  const removeQuestion = (index: number) => {
    const newQuestions = questions.filter((_, idx) => idx !== index);
    onConfigChange({
      ...config,
      questions: newQuestions
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="title">Quiz Title</Label>
        <Input
          id="title"
          value={config.title}
          onChange={(e) => onConfigChange({ ...config, title: e.target.value })}
          placeholder="Enter quiz title"
        />
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Questions</h3>
          <Button onClick={addQuestion} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Question
          </Button>
        </div>

        {questions.map((question, index) => (
          <div key={index} className="space-y-4 p-4 border rounded-lg relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2"
              onClick={() => removeQuestion(index)}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>

            <div>
              <Label htmlFor={`question-${index}`}>Question {index + 1}</Label>
              <Textarea
                id={`question-${index}`}
                value={question.question}
                onChange={(e) => handleQuestionChange(index, 'question', e.target.value)}
                placeholder="Enter your question"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor={`answer-${index}`}>Expected Answer</Label>
              <Textarea
                id={`answer-${index}`}
                value={question.expectedAnswer}
                onChange={(e) => handleQuestionChange(index, 'expectedAnswer', e.target.value)}
                placeholder="Enter the expected answer"
                className="mt-1"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}