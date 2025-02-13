import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AdminConfig } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  config: AdminConfig;
  onConfigChange: (config: AdminConfig) => void;
  isEditMode?: boolean;
}

interface QuizQuestion {
  question: string;
  expectedAnswer: string;
}

export default function AdminPanel({ config, onConfigChange, isEditMode = false }: Props) {
  console.log('AdminPanel mounted with config:', config); // Debug log

  // Initialize questions state with config.questions if available
  const [questions, setQuestions] = useState<QuizQuestion[]>(() => {
    // Debug log
    console.log('Initializing questions with:', {
      type: config.type,
      hasQuestions: Boolean(config.questions),
      questionsLength: config.questions?.length
    });

    // Deep copy the questions from config if available
    if (config.type === 'quiz' && config.questions && Array.isArray(config.questions) && config.questions.length > 0) {
      return JSON.parse(JSON.stringify(config.questions));
    }
    return [{ question: "", expectedAnswer: "" }];
  });

  const { toast } = useToast();

  // Keep questions in sync with config changes
  useEffect(() => {
    console.log('Config changed:', config); // Debug log
    if (config.type === 'quiz' && config.questions && Array.isArray(config.questions) && config.questions.length > 0) {
      // Deep copy the questions
      const newQuestions = JSON.parse(JSON.stringify(config.questions));
      console.log('Updating questions to:', newQuestions); // Debug log
      setQuestions(newQuestions);
    }
  }, [config.type, config.questions]); 

  const addQuestion = () => {
    const newQuestions = [...questions, { question: "", expectedAnswer: "" }];
    setQuestions(newQuestions);
    onConfigChange({
      ...config,
      questions: newQuestions
    });
  };

  const removeQuestion = (index: number) => {
    if (questions.length > 1) {
      const newQuestions = questions.filter((_, i) => i !== index);
      setQuestions(newQuestions);
      onConfigChange({
        ...config,
        questions: newQuestions
      });
    }
  };

  const updateQuestion = (index: number, field: keyof QuizQuestion, value: string) => {
    const newQuestions = questions.map((q, i) =>
      i === index ? { ...q, [field]: value } : q
    );
    setQuestions(newQuestions);
    onConfigChange({
      ...config,
      questions: newQuestions
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <input
            id="title"
            type="text"
            value={config.title}
            onChange={(e) => onConfigChange({
              ...config,
              title: e.target.value
            })}
            placeholder="Enter a title for this GPT..."
            className="w-full px-3 py-2 border rounded-md"
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
                questions: newType === 'quiz' ? [{ question: "", expectedAnswer: "" }] : undefined
              });
              if (newType === 'quiz') {
                setQuestions([{ question: "", expectedAnswer: "" }]);
              }
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

        {config.type === 'quiz' ? (
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4">Quiz Questions</h3>
              {questions.map((q, index) => (
                <div key={index} className="space-y-4 mb-6 pb-6 border-b last:border-b-0">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium">Question {index + 1}</h4>
                    {questions.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeQuestion(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`question-${index}`}>Question Text</Label>
                    <Textarea
                      id={`question-${index}`}
                      value={q.question}
                      onChange={(e) => updateQuestion(index, 'question', e.target.value)}
                      placeholder="Enter your question..."
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`answer-${index}`}>Expected Answer</Label>
                    <Textarea
                      id={`answer-${index}`}
                      value={q.expectedAnswer}
                      onChange={(e) => updateQuestion(index, 'expectedAnswer', e.target.value)}
                      placeholder="Enter the expected answer..."
                      rows={3}
                    />
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                className="w-full mt-4"
                onClick={addQuestion}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Question
              </Button>
            </div>
          </div>
        ) : (
          <>
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
                Specify criteria that will be used to assess and provide feedback on {config.type === 'upload' ? 'uploads' : 'user interactions'}.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}