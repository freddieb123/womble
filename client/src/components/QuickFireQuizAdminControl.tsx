import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const OPTION_LABELS = ["A", "B", "C", "D"];
const OPTION_COLOURS = [
  "bg-red-100 text-red-700 border-red-200",
  "bg-blue-100 text-blue-700 border-blue-200",
  "bg-yellow-100 text-yellow-800 border-yellow-200",
  "bg-green-100 text-green-700 border-green-200",
];

const PHASE_BADGE: Record<string, string> = {
  waiting: "bg-gray-100 text-gray-600",
  question: "bg-green-100 text-green-700",
  results: "bg-amber-100 text-amber-700",
  finished: "bg-blue-100 text-blue-700",
};

interface ReviewQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  orderIndex: number;
}

interface QuizState {
  phase: string;
  currentQuestionIndex: number;
  questionStartedAt: string | null;
  totalQuestions: number;
  participantCount: number;
  answeredCount: number;
  currentQuestion: {
    id: number;
    question: string;
    options: string[];
    timeLimit: number;
    correctIndex: number;
  } | null;
  allQuestions?: ReviewQuestion[];
}

interface Props {
  configId: number;
  open: boolean;
  onClose: () => void;
  shareToken?: string;
}

export default function QuickFireQuizAdminControl({ configId, open, onClose, shareToken }: Props) {
  const queryClient = useQueryClient();

  const { data: state } = useQuery<QuizState>({
    queryKey: ["/api/quick-fire-quiz", configId, "state", "admin"],
    queryFn: async () => {
      const res = await fetch(`/api/quick-fire-quiz/${configId}/state`);
      return res.json();
    },
    refetchInterval: 2000,
    enabled: open,
  });

  const { data: leaderboard } = useQuery<{ entries: any[] }>({
    queryKey: ["/api/quick-fire-quiz", configId, "leaderboard", "admin"],
    queryFn: async () => {
      const res = await fetch(`/api/quick-fire-quiz/${configId}/leaderboard`);
      return res.json();
    },
    refetchInterval: 3000,
    enabled: open,
  });

  const participantCount = state?.participantCount ?? leaderboard?.entries?.length ?? 0;
  const answeredCount = state?.answeredCount ?? 0;

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(id);
  }, []);

  const timeRemaining = useMemo(() => {
    if (state?.phase !== "question" || !state.questionStartedAt) return null;
    const elapsed = (Date.now() - new Date(state.questionStartedAt).getTime()) / 1000;
    return Math.max(0, (state.currentQuestion?.timeLimit ?? 30) - elapsed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, tick]);

  const postAction = async (action: string) => {
    await fetch(`/api/quick-fire-quiz/${configId}/${action}`, { method: "POST" });
    queryClient.invalidateQueries({ queryKey: ["/api/quick-fire-quiz", configId, "state", "admin"] });
  };

  const startMutation = useMutation({ mutationFn: () => postAction("start") });
  const nextMutation = useMutation({ mutationFn: () => postAction("next") });
  const resetMutation = useMutation({ mutationFn: () => postAction("reset") });

  const phase = state?.phase ?? "waiting";
  const q = state?.currentQuestion ?? null;
  const tl = q?.timeLimit ?? 30;
  const remaining = timeRemaining ?? tl;
  const pct = (remaining / tl) * 100;

  const isLastQuestion = state ? state.currentQuestionIndex + 1 >= state.totalQuestions : false;
  const nextLabel =
    phase === "waiting" ? null
    : phase === "question" ? "Show Results Early"
    : phase === "results" ? (isLastQuestion ? "Show Final Results" : "Next Question")
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Quiz Control</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status row */}
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${PHASE_BADGE[phase] ?? "bg-gray-100 text-gray-600"}`}>
              {phase}
            </span>
            <div className="text-sm text-gray-500 text-center">
              <span>{participantCount} participant{participantCount !== 1 ? "s" : ""}</span>
              {(phase === "question" || phase === "results") && (
                <span className="ml-2 text-xs text-gray-400">
                  ({answeredCount}/{participantCount} answered)
                </span>
              )}
            </div>
            {state && (
              <span className="text-xs text-gray-400">
                Q{state.currentQuestionIndex + 1} / {state.totalQuestions}
              </span>
            )}
          </div>

          {/* Timer (during question phase) */}
          {phase === "question" && q && (
            <>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${pct > 50 ? "bg-green-500" : pct > 20 ? "bg-amber-400" : "bg-red-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-right text-gray-500">{Math.ceil(remaining)}s remaining</p>
            </>
          )}

          {/* Current question */}
          {q && phase !== "finished" && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <p className="font-semibold text-gray-900 text-sm">{q.question}</p>
              <div className="space-y-1.5">
                {q.options.map((opt, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${OPTION_COLOURS[i]} ${i === q.correctIndex ? "font-bold" : ""}`}
                  >
                    <span className="font-bold">{OPTION_LABELS[i]}</span>
                    <span className="flex-1">{opt}</span>
                    {i === q.correctIndex && <span>✓ Correct</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {phase === "waiting" && (
            <p className="text-sm text-gray-500 text-center py-4">
              Waiting for participants… Click Start when ready.
            </p>
          )}

          {phase === "finished" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 text-center font-medium">Quiz complete! 🎉</p>
              {state?.allQuestions && state.allQuestions.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Question Review</p>
                  {state.allQuestions.map((q, qi) => (
                    <div key={q.id} className="border border-gray-100 rounded-lg p-2.5 space-y-1.5">
                      <p className="text-xs font-semibold text-gray-800">Q{qi + 1}. {q.question}</p>
                      <div className="grid grid-cols-2 gap-1">
                        {q.options.map((opt, oi) => {
                          const isCorrect = oi === q.correctIndex;
                          return (
                            <div
                              key={oi}
                              className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs ${
                                isCorrect ? "bg-green-50 border border-green-300 text-green-800 font-medium" : "bg-gray-50 text-gray-400"
                              }`}
                            >
                              <span className={`w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${isCorrect ? "bg-green-600 text-white" : "bg-gray-300 text-gray-600"}`}>
                                {OPTION_LABELS[oi]}
                              </span>
                              <span className="truncate">{opt}</span>
                              {isCorrect && <span className="ml-auto text-green-600 flex-shrink-0">✓</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="pt-2 border-t space-y-2">
            {phase === "finished" && shareToken && (
              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                onClick={() => window.open(`${window.location.origin}/session-analysis?token=${shareToken}&configId=${configId}`, '_blank')}
              >
                View participant answers ↗
              </Button>
            )}
            <div className="flex items-center justify-between">
            {phase === "waiting" && (
              <Button
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                Start Quiz
              </Button>
            )}
            {nextLabel && (
              <Button
                onClick={() => nextMutation.mutate()}
                disabled={nextMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {nextLabel}
              </Button>
            )}
            {phase === "finished" && <span />}

            <button
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors ml-auto"
            >
              Reset
            </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
