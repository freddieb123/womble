import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Wand2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { AdminConfig } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  config: AdminConfig;
  onConfigChange: (config: AdminConfig) => void;
  isEditMode?: boolean;
}

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
}

export default function AdminPanel({ config, onConfigChange, isEditMode = false }: Props) {
  const [isImproving, setIsImproving] = useState(false);
  const [hasImproved, setHasImproved] = useState(false);
  const { toast } = useToast();

  const addQuestion = () => {
    const newQuestion: QuizQuestion = {
      id: crypto.randomUUID(),
      question: "",
      options: ["", "", "", ""],
      correctAnswer: "",
    };

    onConfigChange({
      ...config,
      quizQuestions: [...(config.quizQuestions || []), newQuestion]
    });
  };

  const updateQuestion = (questionId: string, updates: Partial<QuizQuestion>) => {
    onConfigChange({
      ...config,
      quizQuestions: (config.quizQuestions || []).map(q =>
        q.id === questionId ? { ...q, ...updates } : q
      )
    });
  };

  const removeQuestion = (questionId: string) => {
    onConfigChange({
      ...config,
      quizQuestions: (config.quizQuestions || []).filter(q => q.id !== questionId)
    });
  };

  const improveCriteria = async () => {
    if (!config.feedbackCriteria) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter some initial feedback criteria first."
      });
      return;
    }

    try {
      setIsImproving(true);
      const response = await fetch("/api/improve-criteria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackCriteria: config.feedbackCriteria }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const { improvedCriteria } = await response.json();
      onConfigChange({
        ...config,
        feedbackCriteria: improvedCriteria
      });

      setHasImproved(true);
      toast({
        description: "Feedback criteria improved successfully!"
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to improve criteria"
      });
    } finally {
      setIsImproving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={config.title}
            onChange={(e) => onConfigChange({
              ...config,
              title: e.target.value
            })}
            placeholder="Enter a title for this GPT..."
          />
          <p className="text-sm text-muted-foreground">
            Give your GPT a memorable title.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="type">Type</Label>
          <Select
            value={config.type || "chat"}
            onValueChange={(value) => {
              const newType = value as 'chat' | 'upload' | 'quiz';
              onConfigChange({
                ...config,
                type: newType,
                quizQuestions: newType === 'quiz' ? [] : undefined
              });
            }}
            disabled={isEditMode}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="chat">Chat</SelectItem>
              <SelectItem value="upload">Upload</SelectItem>
              <SelectItem value="quiz">Quiz</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Choose between a chat-based, upload-based, or quiz-based interface.
          </p>
        </div>

        {config.type === 'quiz' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Quiz Questions</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={addQuestion}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Question
              </Button>
            </div>

            {(config.quizQuestions || []).map((question, idx) => (
              <Card key={question.id} className="p-4">
                <CardContent className="space-y-4">
                  <div className="flex items-start justify-between">
                    <Label className="text-lg font-semibold">Question {idx + 1}</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeQuestion(question.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label>Question Text</Label>
                    <Textarea
                      value={question.question}
                      onChange={(e) => updateQuestion(question.id, { question: e.target.value })}
                      placeholder="Enter your question..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Options</Label>
                    {question.options.map((option, optionIdx) => (
                      <div key={optionIdx} className="flex gap-2">
                        <Input
                          value={option}
                          onChange={(e) => {
                            const newOptions = [...question.options];
                            newOptions[optionIdx] = e.target.value;
                            updateQuestion(question.id, { options: newOptions });
                          }}
                          placeholder={`Option ${optionIdx + 1}`}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <Label>Correct Answer</Label>
                    <Select
                      value={question.correctAnswer}
                      onValueChange={(value) => updateQuestion(question.id, { correctAnswer: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select correct answer" />
                      </SelectTrigger>
                      <SelectContent>
                        {question.options.map((option, optionIdx) => (
                          <SelectItem key={optionIdx} value={option}>
                            {option || `Option ${optionIdx + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Explanation (Optional)</Label>
                    <Textarea
                      value={question.explanation || ""}
                      onChange={(e) => updateQuestion(question.id, { explanation: e.target.value })}
                      placeholder="Explain why this answer is correct..."
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="system-prompt">System Prompt</Label>
          <Textarea
            id="system-prompt"
            value={config.systemPrompt}
            onChange={(e) => onConfigChange({
              ...config,
              systemPrompt: e.target.value
            })}
            placeholder="Enter system prompt..."
            className="resize-none"
            rows={6}
          />
          <p className="text-sm text-muted-foreground">
            Customize how the AI assistant behaves by providing specific instructions.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="user-instructions">User Instructions</Label>
          <Textarea
            id="user-instructions"
            value={config.userInstructions}
            onChange={(e) => onConfigChange({
              ...config,
              userInstructions: e.target.value
            })}
            placeholder="Enter instructions for users..."
            className="resize-none"
            rows={4}
          />
          <p className="text-sm text-muted-foreground">
            Add helpful instructions or context that will be shown to users of this {config.type || 'chat'}.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="feedback-criteria">Feedback Criteria</Label>
          <Textarea
            id="feedback-criteria"
            value={config.feedbackCriteria}
            onChange={(e) => onConfigChange({
              ...config,
              feedbackCriteria: e.target.value
            })}
            placeholder="Enter criteria for providing feedback to users..."
            className="resize-none"
            rows={4}
          />
          <p className="text-sm text-muted-foreground">
            Specify criteria that will be used to assess and provide feedback on {
              config.type === 'upload' ? 'uploads' :
              config.type === 'quiz' ? 'quiz responses' :
              'user interactions'
            }.
          </p>
        </div>
      </div>
    </div>
  );
}