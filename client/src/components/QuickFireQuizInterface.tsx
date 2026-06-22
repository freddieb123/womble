import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import LeaderboardModal from "@/components/LeaderboardModal";

const OPTION_STYLES = [
  { bg: "bg-green-600 hover:bg-green-700", selected: "bg-green-800 ring-2 ring-green-400", badge: "bg-green-500", label: "A" },
  { bg: "bg-teal-600 hover:bg-teal-700", selected: "bg-teal-800 ring-2 ring-teal-400", badge: "bg-teal-500", label: "B" },
  { bg: "bg-emerald-600 hover:bg-emerald-700", selected: "bg-emerald-800 ring-2 ring-emerald-400", badge: "bg-emerald-500", label: "C" },
  { bg: "bg-slate-600 hover:bg-slate-700", selected: "bg-slate-800 ring-2 ring-slate-400", badge: "bg-slate-500", label: "D" },
];

interface ReviewQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  orderIndex: number;
}

interface QuizState {
  phase: 'waiting' | 'question' | 'results' | 'finished';
  currentQuestionIndex: number;
  questionStartedAt: string | null;
  totalQuestions: number;
  currentQuestion: {
    id: number;
    question: string;
    options: string[];
    timeLimit: number;
    orderIndex: number;
    correctIndex?: number;
  } | null;
  allQuestions?: ReviewQuestion[];
}

interface LeaderboardData {
  entries: { participantId: string; userName: string; totalPoints: number; rank: number; isCurrentUser: boolean }[];
  currentUserRank?: number;
}

interface Props {
  configId: number;
  userName: string | null;
}

export default function QuickFireQuizInterface({ configId, userName }: Props) {
  const participantId = useRef<string>(crypto.randomUUID());
  const answeredQuestions = useRef<Set<number>>(new Set());
  const userAnswers = useRef<Map<number, number>>(new Map());
  const queryClient = useQueryClient();

  const [localName, setLocalName] = useState(userName ?? "");
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<{ points: number; correct: boolean } | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [finishedTab, setFinishedTab] = useState<'leaderboard' | 'review'>('leaderboard');

  const { data: state } = useQuery<QuizState>({
    queryKey: ["/api/quick-fire-quiz", configId, "state"],
    queryFn: async () => {
      const res = await fetch(`/api/quick-fire-quiz/${configId}/state`);
      if (!res.ok) throw new Error("Failed to fetch state");
      return res.json();
    },
    refetchInterval: 1000,
    enabled: nameSubmitted,
  });

  // Register presence and heartbeat while in waiting room
  useEffect(() => {
    if (!nameSubmitted) return;
    const ping = () => fetch(`/api/quick-fire-quiz/${configId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId: participantId.current }),
    });
    ping();
    const interval = setInterval(ping, 10_000);
    return () => clearInterval(interval);
  }, [nameSubmitted, configId]);

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

  // Reset per-question state when question changes
  useEffect(() => {
    if (!state?.currentQuestion) return;
    const qId = state.currentQuestion.id;
    if (!answeredQuestions.current.has(qId)) {
      setSelectedIndex(null);
      setLastResult(null);
    }
  }, [state?.currentQuestion?.id]);

  // Auto-fetch leaderboard when phase becomes results or finished
  useEffect(() => {
    if (state?.phase === "results" || state?.phase === "finished") {
      fetchLeaderboard();
    }
  }, [state?.phase]);

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch(`/api/quick-fire-quiz/${configId}/leaderboard?participantId=${participantId.current}`);
      if (!res.ok) return;
      const data = await res.json();
      setLeaderboard({
        entries: data.entries.map((e: any) => ({
          ...e,
          score: e.totalPoints,
          isCurrentUser: e.participantId === participantId.current,
        })),
        currentUserRank: data.currentUserRank,
      });
    } catch {}
  };

  const submitAnswer = async (optIdx: number) => {
    if (!state?.currentQuestion) return;
    const qId = state.currentQuestion.id;
    if (answeredQuestions.current.has(qId)) return;

    const responseTimeMs = state.questionStartedAt
      ? Date.now() - new Date(state.questionStartedAt).getTime()
      : 0;

    setSelectedIndex(optIdx);
    answeredQuestions.current.add(qId);
    userAnswers.current.set(qId, optIdx);

    try {
      const res = await fetch(`/api/quick-fire-quiz/${configId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: qId,
          participantId: participantId.current,
          userName: nameSubmitted ? localName : null,
          selectedIndex: optIdx,
          responseTimeMs,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        setLastResult(result);
      }
    } catch {}
  };

  // ── Name entry ────────────────────────────────────────────────────────────

  if (!nameSubmitted) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 w-full max-w-sm text-center space-y-4">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <span className="text-2xl">⚡</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Quick Fire Quiz</h2>
          <p className="text-sm text-gray-500">Enter your name to join. Answer fast — speed earns bonus points!</p>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
            placeholder="Your name"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && localName.trim()) setNameSubmitted(true); }}
            autoFocus
          />
          <button
            onClick={() => setNameSubmitted(true)}
            disabled={!localName.trim()}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors"
          >
            Join Quiz
          </button>
        </div>
      </div>
    );
  }

  // ── Waiting ───────────────────────────────────────────────────────────────

  if (!state || state.phase === "waiting") {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 w-full max-w-sm text-center space-y-4">
          <div className="text-4xl">⚡</div>
          <h2 className="text-xl font-bold text-gray-900">Quick Fire Quiz</h2>
          <p className="text-gray-500 text-sm">Waiting for the quiz to start…</p>
          <div className="flex justify-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-green-400 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <p className="text-xs text-gray-400">You're in as <strong>{localName}</strong>. Get ready!</p>
        </div>
      </div>
    );
  }

  // ── Question ──────────────────────────────────────────────────────────────

  if (state.phase === "question" && state.currentQuestion) {
    const q = state.currentQuestion;
    const tl = q.timeLimit;
    const remaining = timeRemaining ?? 0;
    const pct = (remaining / tl) * 100;
    const alreadyAnswered = answeredQuestions.current.has(q.id);

    const timerColour = pct > 50 ? "bg-green-500" : pct > 20 ? "bg-amber-400" : "bg-red-500";

    return (
      <div className="flex flex-col h-full min-h-[400px] space-y-4">
        {/* Timer bar */}
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${timerColour}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Q{state.currentQuestionIndex + 1} / {state.totalQuestions}</span>
          <span className={`font-bold text-sm ${remaining <= 5 ? "text-red-500" : "text-gray-700"}`}>
            {Math.ceil(remaining)}s
          </span>
        </div>

        {/* Question */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
          <p className="text-xl font-bold text-gray-900">{q.question}</p>
        </div>

        {alreadyAnswered && (
          <p className="text-center text-sm text-green-600 font-medium">🔒 Locked in! Waiting for results…</p>
        )}

        {/* Options grid */}
        <div className="grid grid-cols-2 gap-2">
          {q.options.map((opt, optIdx) => {
            const style = OPTION_STYLES[optIdx];
            const isSelected = selectedIndex === optIdx;
            return (
              <button
                key={optIdx}
                onClick={() => !alreadyAnswered && remaining > 0 && submitAnswer(optIdx)}
                disabled={alreadyAnswered || remaining <= 0}
                className={`rounded-lg px-3 py-2.5 text-white text-sm text-left flex items-center gap-2.5 transition-all disabled:cursor-default ${
                  isSelected ? style.selected : alreadyAnswered ? `${style.bg} opacity-50` : style.bg
                }`}
              >
                <span className={`w-6 h-6 ${style.badge} rounded flex items-center justify-center text-xs font-bold flex-shrink-0`}>
                  {style.label}
                </span>
                <span className="leading-snug">{opt}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────────

  if (state.phase === "results" && state.currentQuestion) {
    const q = state.currentQuestion;
    const correctIdx = q.correctIndex ?? -1;

    return (
      <div className="flex flex-col h-full min-h-[400px] space-y-4">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Q{state.currentQuestionIndex + 1} / {state.totalQuestions} — Results</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
          <p className="text-xl font-bold text-gray-900">{q.question}</p>
        </div>

        {lastResult && (
          <div className={`text-center text-sm font-medium px-4 py-2 rounded-lg ${lastResult.correct ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
            {lastResult.correct ? `✓ Correct! +${lastResult.points} points` : "✗ Not quite — better luck next time"}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {q.options.map((opt, optIdx) => {
            const style = OPTION_STYLES[optIdx];
            const isCorrect = optIdx === correctIdx;
            const wasSelected = selectedIndex === optIdx;
            return (
              <div
                key={optIdx}
                className={`rounded-lg px-3 py-2.5 text-sm flex items-center gap-2.5 ${
                  isCorrect
                    ? "bg-green-600 text-white font-semibold"
                    : wasSelected
                    ? "bg-red-400 text-white opacity-80"
                    : "bg-gray-100 text-gray-400 opacity-50"
                }`}
              >
                <span className={`w-6 h-6 ${isCorrect ? "bg-green-500" : wasSelected ? "bg-red-300" : style.badge + " opacity-50"} rounded flex items-center justify-center text-xs font-bold flex-shrink-0`}>
                  {style.label}
                </span>
                <span className="leading-snug">{opt}</span>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => { fetchLeaderboard(); setShowLeaderboard(true); }}
          className="w-full border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          View leaderboard
        </button>

        {leaderboard && (
          <LeaderboardModal
            open={showLeaderboard}
            onOpenChange={setShowLeaderboard}
            entries={leaderboard.entries.map(e => ({ userName: e.userName, score: (e as any).totalPoints ?? (e as any).score, isCurrentUser: e.isCurrentUser }))}
            currentUserRank={leaderboard.currentUserRank}
            title="Leaderboard"
            maxScore={state.totalQuestions * 1000}
            onRefresh={fetchLeaderboard}
          />
        )}
      </div>
    );
  }

  // ── Finished ──────────────────────────────────────────────────────────────

  if (state.phase === "finished") {
    const lbEntries = leaderboard?.entries.map(e => ({
      ...e,
      score: (e as any).totalPoints ?? (e as any).score,
    })) ?? [];
    const maxScore = state.totalQuestions * 1000;
    const currentUserEntry = leaderboard?.currentUserRank && leaderboard.currentUserRank > 3
      ? lbEntries.find(e => e.isCurrentUser)
      : null;

    return (
      <div className="flex flex-col h-full min-h-[400px]">
        <div className="text-center pt-4 pb-3">
          <div className="text-4xl mb-1">🎉</div>
          <h2 className="text-xl font-bold text-gray-900">Quiz Complete!</h2>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-4">
          <button
            onClick={() => setFinishedTab('leaderboard')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${finishedTab === 'leaderboard' ? 'border-b-2 border-green-600 text-green-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Leaderboard
          </button>
          <button
            onClick={() => setFinishedTab('review')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${finishedTab === 'review' ? 'border-b-2 border-green-600 text-green-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Review
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {finishedTab === 'leaderboard' && (
            <div className="space-y-2 pb-4">
              {!leaderboard ? (
                <button
                  onClick={fetchLeaderboard}
                  className="w-full bg-green-600 hover:bg-green-700 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
                >
                  View Final Results
                </button>
              ) : (
                <>
                  {lbEntries.slice(0, 3).map((entry, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between px-4 py-3 rounded-lg border ${entry.isCurrentUser ? 'bg-blue-50 border-red-400 border-2' : 'bg-white border-gray-100'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                        <span className="font-medium text-sm">{entry.userName || 'Anonymous'}</span>
                      </div>
                      <span className="font-bold text-sm text-gray-700">{entry.score}/{maxScore}</span>
                    </div>
                  ))}
                  {currentUserEntry && (
                    <>
                      <p className="text-center text-gray-400 text-xs">• • •</p>
                      <div className="flex items-center justify-between px-4 py-3 rounded-lg border-2 bg-blue-50 border-red-400">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">#{leaderboard.currentUserRank}</span>
                          <span className="font-medium text-sm">{currentUserEntry.userName || 'Anonymous'}</span>
                        </div>
                        <span className="font-bold text-sm text-gray-700">{currentUserEntry.score}/{maxScore}</span>
                      </div>
                    </>
                  )}
                  <button
                    onClick={fetchLeaderboard}
                    className="w-full border border-gray-200 rounded-lg py-2 text-sm text-gray-500 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span>↻</span> Update
                  </button>
                </>
              )}
            </div>
          )}

          {finishedTab === 'review' && state.allQuestions && state.allQuestions.length > 0 && (
            <div className="space-y-3 pb-4">
              {state.allQuestions.map((q, qi) => {
                const userPick = userAnswers.current.get(q.id);
                const gotItRight = userPick !== undefined && userPick === q.correctIndex;
                const gotItWrong = userPick !== undefined && userPick !== q.correctIndex;
                return (
                  <div key={q.id} className="border border-gray-100 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-800">Q{qi + 1}. {q.question}</p>
                      {gotItRight && <span className="text-xs font-medium text-green-600 flex-shrink-0 ml-2">✓ Correct</span>}
                      {gotItWrong && <span className="text-xs font-medium text-red-500 flex-shrink-0 ml-2">✗ Incorrect</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {q.options.map((opt, oi) => {
                        const isCorrect = oi === q.correctIndex;
                        const wasMyWrongPick = gotItWrong && oi === userPick;
                        const style = OPTION_STYLES[oi];
                        return (
                          <div
                            key={oi}
                            className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-xs ${
                              isCorrect
                                ? "bg-green-50 border border-green-300 text-green-800 font-medium"
                                : wasMyWrongPick
                                ? "bg-red-50 border border-red-300 text-red-700 font-medium"
                                : "bg-gray-50 text-gray-400"
                            }`}
                          >
                            <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                              isCorrect ? "bg-green-600 text-white" : wasMyWrongPick ? "bg-red-400 text-white" : style.badge + " text-white opacity-50"
                            }`}>
                              {style.label}
                            </span>
                            <span className="flex-1">{opt}</span>
                            {isCorrect && <span className="ml-auto text-green-600 flex-shrink-0">✓</span>}
                            {wasMyWrongPick && <span className="ml-auto text-red-500 flex-shrink-0">✗ Your answer</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
