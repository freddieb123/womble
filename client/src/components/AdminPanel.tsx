import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import type { AdminConfig } from "@/lib/types";
import { useEffect } from "react";

interface Props {
  config: AdminConfig;
  onConfigChange: (config: AdminConfig) => void;
  isEditMode?: boolean;
}

export default function AdminPanel({ config, onConfigChange, isEditMode = false }: Props) {
  // Initialize questions if they don't exist and we're in quiz mode
  useEffect(() => {
    if (config.type === 'quiz' && (!config.questions || config.questions.length === 0)) {
      onConfigChange({
        ...config,
        questions: [{ question: "", expectedAnswer: "" }]
      });
    }
  }, [config.type]);

  const handleTypeChange = (newType: 'chat' | 'upload' | 'quiz' | 'two-way-conversation') => {
    onConfigChange({
      ...config,
      type: newType,
      // Preserve questions if switching back to quiz type
      questions: newType === 'quiz'
        ? (config.questions?.length ? config.questions : [{ question: "", expectedAnswer: "" }])
        : undefined,
    });
  };

  const handleAddQuestion = () => {
    const newQuestions = [
      ...(config.questions || []),
      { question: "", expectedAnswer: "" }
    ];
    onConfigChange({
      ...config,
      questions: newQuestions
    });
  };

  const handleRemoveQuestion = (index: number) => {
    if (!config.questions || config.questions.length <= 1) return;
    const newQuestions = config.questions.filter((_, i) => i !== index);
    onConfigChange({
      ...config,
      questions: newQuestions
    });
  };

  const handleQuestionChange = (index: number, field: 'question' | 'expectedAnswer', value: string) => {
    if (!config.questions) return;
    const newQuestions = config.questions.map((q, i) =>
      i === index ? { ...q, [field]: value } : q
    );
    onConfigChange({
      ...config,
      questions: newQuestions
    });
  };

  return (
    <div className="space-y-6">
      {/* Segmented control for "Type" */}
      <div className="space-y-1">

        <div className="inline-flex items-center justify-start space-x-px rounded-md border overflow-hidden">
          <button
            type="button"
            disabled={isEditMode}
            className={`px-4 py-2 text-sm font-medium focus:outline-none
              ${config.type === 'chat' ? "bg-green-200 text-green-900" : "bg-white text-gray-700"}
            `}
            onClick={() => handleTypeChange('chat')}
          >
            Chat with a GPT
          </button>
          <button
            type="button"
            disabled={isEditMode}
            className={`px-4 py-2 text-sm font-medium focus:outline-none
              ${config.type === 'upload' ? "bg-green-200 text-green-900" : "bg-white text-gray-700"}
            `}
            onClick={() => handleTypeChange('upload')}
          >
            Upload
          </button>
          <button
            type="button"
            disabled={isEditMode}
            className={`px-4 py-2 text-sm font-medium focus:outline-none
              ${config.type === 'quiz' ? "bg-green-200 text-green-900" : "bg-white text-gray-700"}
            `}
            onClick={() => handleTypeChange('quiz')}
          >
            Quiz
          </button>
          <button
            type="button"
            disabled={isEditMode}
            className={`px-4 py-2 text-sm font-medium focus:outline-none
              ${config.type === 'two-way-conversation' ? "bg-green-200 text-green-900" : "bg-white text-gray-700"}
            `}
            onClick={() => handleTypeChange('two-way-conversation')}
          >
            Two-way Conversation
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <input
            id="title"
            type="text"
            value={config.title}
            onChange={(e) =>
              onConfigChange({
                ...config,
                title: e.target.value
              })
            }
            placeholder="Give your quiz a memorable title"
            className="w-full px-3 py-2 border rounded-md"
          />
        </div>

        {/* Quiz section */}
        {config.type === 'quiz' && (
          <div className="space-y-4 border rounded-lg p-4">
            {Array.isArray(config.questions) &&
              config.questions.map((question, index) => (
                <div key={index} className="space-y-4 mb-6 pb-6 border-b last:border-b-0">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium">Question {index + 1}</h4>
                    {Array.isArray(config.questions) && config.questions.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveQuestion(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`question-${index}`}>Question Text</Label>
                    <Textarea
                      id={`question-${index}`}
                      value={question.question}
                      onChange={(e) => handleQuestionChange(index, 'question', e.target.value)}
                      placeholder="Enter your question..."
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`answer-${index}`}>Expected Answer</Label>
                    <Textarea
                      id={`answer-${index}`}
                      value={question.expectedAnswer}
                      onChange={(e) => handleQuestionChange(index, 'expectedAnswer', e.target.value)}
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
              onClick={handleAddQuestion}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Question
            </Button>
          </div>
        )}

        {/* Chat / Upload shared fields */}
        {config.type !== 'quiz' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="system-prompt">System Prompt</Label>
              <Textarea
                id="system-prompt"
                value={config.systemPrompt || ''}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    systemPrompt: e.target.value
                  })
                }
                placeholder="Act as a..."
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
                value={config.userInstructions || ''}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    userInstructions: e.target.value
                  })
                }
                placeholder="Enter instructions for users..."
                className="resize-none"
                rows={4}
              />
                 <p className="text-sm text-muted-foreground">
                Add helpful instructions or context that will be shown to users.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback-criteria">Feedback Criteria</Label>
              <Textarea
                id="feedback-criteria"
                value={config.feedbackCriteria || ''}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    feedbackCriteria: e.target.value
                  })
                }
                placeholder="Enter criteria for providing feedback to users..."
                className="resize-none"
                rows={4}
              />

            </div>
          </>
        )}
      </div>
    </div>
  );
}