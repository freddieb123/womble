import { useState } from "react";
import { Trash2, Plus, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AdminConfig, QuickFireQuestion } from "@/lib/types";

const OPTION_COLOURS = [
  { bg: "bg-red-500", text: "text-white", label: "A" },
  { bg: "bg-blue-500", text: "text-white", label: "B" },
  { bg: "bg-yellow-400", text: "text-gray-900", label: "C" },
  { bg: "bg-green-500", text: "text-white", label: "D" },
];

interface Props {
  config: AdminConfig;
  onConfigChange: (config: AdminConfig) => void;
}

function emptyQuestion(timeLimit: number, orderIndex: number): QuickFireQuestion {
  return {
    question: "",
    options: ["", "", "", ""],
    correctIndex: 0,
    timeLimit,
    orderIndex,
  };
}

export default function QuickFireQuizEditor({ config, onConfigChange }: Props) {
  const questions: QuickFireQuestion[] = (config.quickFireQuestions as QuickFireQuestion[]) ?? [];
  const [defaultTimeLimit, setDefaultTimeLimit] = useState(30);
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null);

  const update = (updated: QuickFireQuestion[]) => {
    onConfigChange({ ...config, quickFireQuestions: updated });
  };

  const addQuestion = () => {
    update([...questions, emptyQuestion(defaultTimeLimit, questions.length)]);
  };

  const removeQuestion = (idx: number) => {
    update(questions.filter((_, i) => i !== idx).map((q, i) => ({ ...q, orderIndex: i })));
  };

  const updateQuestion = (idx: number, patch: Partial<QuickFireQuestion>) => {
    update(questions.map((q, i) => i === idx ? { ...q, ...patch } : q));
  };

  const updateOption = (qIdx: number, optIdx: number, value: string) => {
    const options = [...questions[qIdx].options] as [string, string, string, string];
    options[optIdx] = value;
    updateQuestion(qIdx, { options });
  };

  const distractorIndices = (q: QuickFireQuestion) =>
    ([0, 1, 2, 3] as const).filter(i => i !== q.correctIndex);

  const generateDistractors = async (idx: number) => {
    const q = questions[idx];
    const correctAnswer = q.options[q.correctIndex];
    if (!q.question.trim() || !correctAnswer.trim()) return;
    setGeneratingIdx(idx);
    try {
      const res = await fetch("/api/configs/generate-quick-fire-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q.question, correctAnswer }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const { distractors } = await res.json();
      const options = [...q.options] as [string, string, string, string];
      distractorIndices(q).forEach((optIdx, i) => {
        options[optIdx] = distractors[i] ?? '';
      });
      updateQuestion(idx, { options });
    } catch {
      // leave options as-is; user can retry
    } finally {
      setGeneratingIdx(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Title */}
      <div className="space-y-1.5">
        <Label htmlFor="qfq-title">Quiz title</Label>
        <Input
          id="qfq-title"
          value={config.title}
          onChange={(e) => onConfigChange({ ...config, title: e.target.value })}
          placeholder="e.g. Science Trivia"
        />
      </div>

      {/* Global default time */}
      <div className="flex items-center gap-3">
        <Label className="whitespace-nowrap">Default time per question</Label>
        <Input
          type="number"
          min={5}
          max={120}
          value={defaultTimeLimit}
          onChange={(e) => setDefaultTimeLimit(Number(e.target.value))}
          className="w-24"
        />
        <span className="text-sm text-gray-500">seconds</span>
      </div>

      {/* Question list */}
      <div className="space-y-4">
        {questions.map((q, qIdx) => (
          <div key={qIdx} className="border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Question {qIdx + 1}</span>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-gray-500 whitespace-nowrap">Time (s)</Label>
                <Input
                  type="number"
                  min={5}
                  max={120}
                  value={q.timeLimit}
                  onChange={(e) => updateQuestion(qIdx, { timeLimit: Number(e.target.value) })}
                  className="w-16 h-7 text-xs"
                />
                <button
                  onClick={() => removeQuestion(qIdx)}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <Textarea
              value={q.question}
              onChange={(e) => updateQuestion(qIdx, { question: e.target.value })}
              placeholder="Enter your question…"
              rows={2}
              className="resize-none"
            />

            {/* Correct answer */}
            <div className="space-y-1">
              <Label className="text-xs font-medium text-green-700">Correct answer</Label>
              <Input
                value={q.options[q.correctIndex]}
                onChange={(e) => updateOption(qIdx, q.correctIndex, e.target.value)}
                placeholder="Type the correct answer…"
                className="border-green-500 ring-1 ring-green-400"
              />
            </div>

            {/* Incorrect answers */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-gray-500">Incorrect answers</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => generateDistractors(qIdx)}
                  disabled={!q.question.trim() || !q.options[q.correctIndex].trim() || generatingIdx === qIdx}
                >
                  {generatingIdx === qIdx ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Generating…</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5 mr-1.5" />Generate incorrect answers</>
                  )}
                </Button>
              </div>
              {distractorIndices(q).map((optIdx, distIdx) => (
                <div key={optIdx} className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold flex-shrink-0 ${OPTION_COLOURS[distIdx].bg} ${OPTION_COLOURS[distIdx].text}`}>
                    {OPTION_COLOURS[distIdx].label}
                  </span>
                  <Input
                    value={q.options[optIdx]}
                    onChange={(e) => updateOption(qIdx, optIdx, e.target.value)}
                    placeholder={`Incorrect answer ${distIdx + 1}…`}
                    className="flex-1"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addQuestion} className="w-full border-dashed">
        <Plus className="h-4 w-4 mr-2" />Add Question
      </Button>
    </div>
  );
}
