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
import { Card } from "@/components/ui/card";

interface QuizQuestion {
  question: string;
  correctAnswer: string;
  options: string[];
  explanation?: string;
}

interface Props {
  config: AdminConfig;
  onConfigChange: (config: AdminConfig) => void;
  isEditMode?: boolean;
}

export default function AdminPanel({ config, onConfigChange, isEditMode = false }: Props) {
  const [isImproving, setIsImproving] = useState(false);
  const [hasImproved, setHasImproved] = useState(false);
  const { toast } = useToast();
  const [newOption, setNewOption] = useState("");

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

  const handleAddQuestion = () => {
    const questions = config.quizQuestions || [];
    onConfigChange({
      ...config,
      quizQuestions: [
        ...questions,
        {
          question: "",
          correctAnswer: "",
          options: [],
          explanation: ""
        }
      ]
    });
  };

  const handleQuestionChange = (index: number, field: keyof QuizQuestion, value: string | string[]) => {
    const questions = [...(config.quizQuestions || [])];
    questions[index] = {
      ...questions[index],
      [field]: value
    };
    onConfigChange({
      ...config,
      quizQuestions: questions
    });
  };

  const handleRemoveQuestion = (index: number) => {
    const questions = [...(config.quizQuestions || [])];
    questions.splice(index, 1);
    onConfigChange({
      ...config,
      quizQuestions: questions
    });
  };

  const handleAddOption = (questionIndex: number) => {
    if (!newOption.trim()) return;
    const questions = [...(config.quizQuestions || [])];
    questions[questionIndex] = {
      ...questions[questionIndex],
      options: [...(questions[questionIndex].options || []), newOption.trim()]
    };
    onConfigChange({
      ...config,
      quizQuestions: questions
    });
    setNewOption("");
  };

  const handleRemoveOption = (questionIndex: number, optionIndex: number) => {
    const questions = [...(config.quizQuestions || [])];
    const options = [...questions[questionIndex].options];
    options.splice(optionIndex, 1);
    questions[questionIndex] = {
      ...questions[questionIndex],
      options
    };
    onConfigChange({
      ...config,
      quizQuestions: questions
    });
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

        {config.type === 'quiz' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Quiz Questions</Label>
              <Button
                onClick={handleAddQuestion}
                size="sm"
                variant="outline"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Question
              </Button>
            </div>

            <div className="space-y-4">
              {(config.quizQuestions || []).map((question, qIndex) => (
                <Card key={qIndex} className="p-4 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 space-y-4">
                      <div>
                        <Label>Question {qIndex + 1}</Label>
                        <Textarea
                          value={question.question}
                          onChange={(e) => handleQuestionChange(qIndex, 'question', e.target.value)}
                          placeholder="Enter your question..."
                          className="mt-2"
                        />
                      </div>

                      <div>
                        <Label>Correct Answer</Label>
                        <Input
                          value={question.correctAnswer}
                          onChange={(e) => handleQuestionChange(qIndex, 'correctAnswer', e.target.value)}
                          placeholder="Enter the correct answer..."
                          className="mt-2"
                        />
                      </div>

                      <div>
                        <Label>Options</Label>
                        <div className="space-y-2 mt-2">
                          {question.options.map((option, oIndex) => (
                            <div key={oIndex} className="flex items-center gap-2">
                              <Input
                                value={option}
                                readOnly
                                className="flex-1"
                              />
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleRemoveOption(qIndex, oIndex)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                          <div className="flex items-center gap-2">
                            <Input
                              value={newOption}
                              onChange={(e) => setNewOption(e.target.value)}
                              placeholder="Add new option..."
                              className="flex-1"
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddOption(qIndex);
                                }
                              }}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAddOption(qIndex)}
                            >
                              Add
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div>
                        <Label>Explanation (Optional)</Label>
                        <Textarea
                          value={question.explanation}
                          onChange={(e) => handleQuestionChange(qIndex, 'explanation', e.target.value)}
                          placeholder="Explain why this answer is correct..."
                          className="mt-2"
                        />
                      </div>
                    </div>

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemoveQuestion(qIndex)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

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
            Specify criteria that will be used to assess and provide feedback on {config.type === 'upload' ? 'uploads' : config.type === 'quiz' ? 'quiz responses' : 'user interactions'}.
          </p>
        </div>
      </div>
    </div>
  );
}