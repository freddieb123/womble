import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, TrendingUp, ChevronDown, Brain } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import GroupBoardInterface from "@/components/GroupBoardInterface";

type SessionConfig = {
  id: number;
  title: string;
  type: string;
  isLive: boolean;
  groupBoardSettings?: any;
  systemPrompt?: string;
  userInstructions?: string | null;
  feedbackCriteria?: string | null;
};

type SessionData = {
  id: number;
  shareToken: string;
  title?: string;
  configs: SessionConfig[];
};

type ThinkingMap = {
  keyThemes: string[];
  insights: string[];
  openQuestions: string[];
  nextSteps: string[];
};

type ConversationFeedback = {
  bullets: string[];
  score: number | null;
  summary: string | null;
  thinkingMap?: ThinkingMap;
};

type Submission = {
  sessionId: string;
  userName: string | null;
  chatMode?: string | null;
  feedback: ConversationFeedback | null;
  messages?: any[];
};

const TRAFFIC_LIGHTS = ['🔴', '🟡', '🟢'];

function extractTrafficLight(text: string): { emoji: string | null; rest: string } {
  for (const emoji of TRAFFIC_LIGHTS) {
    const idx = text.indexOf(emoji);
    if (idx !== -1) {
      const before = text.slice(0, idx).replace(/:\s*$/, '').trim();
      const after = text.slice(idx + emoji.length).trim();
      return { emoji, rest: before ? `${before}: ${after}` : after };
    }
  }
  return { emoji: null, rest: text };
}

export default function SessionAnalysis() {
  const { user } = useAuth();
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get('token');
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(true);

  const { data: sessionData, isLoading } = useQuery<SessionData>({
    queryKey: [`/api/sessions/join/${token}`],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/join/${token}`);
      if (!res.ok) throw new Error('Session not found');
      return res.json();
    },
    enabled: !!token,
    staleTime: 30_000,
    refetchInterval: 45_000,
  });

  const activeConfigId = selectedConfigId ?? sessionData?.configs[0]?.id ?? null;
  const selectedConfig = sessionData?.configs.find(c => c.id === activeConfigId);
  const isTwoWayConversation = selectedConfig?.type === 'two-way-conversation';

  const { data: submissions, isLoading: loadingSubmissions } = useQuery<Submission[]>({
    queryKey: [`/api/conversations/${activeConfigId}`],
    queryFn: async () => {
      const res = await fetch(`/api/conversations/${activeConfigId}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!activeConfigId && !isTwoWayConversation,
    refetchInterval: 30_000,
  });

  const { data: dualSubmissions, isLoading: loadingDualSubmissions } = useQuery<Submission[]>({
    queryKey: [`/api/dual-conversations/${activeConfigId}`],
    queryFn: async () => {
      const res = await fetch(`/api/dual-conversations/${activeConfigId}`);
      if (!res.ok) return [];
      const data = await res.json();
      if (!Array.isArray(data)) return [];
      return data.map((d: any) => ({
        sessionId: d.sessionId,
        userName: [d.participant1Name, d.participant2Name].filter(Boolean).join(' & ') || 'Participants',
        chatMode: null,
        feedback: d.feedback?.overall ?? null,
        messages: d.transcript,
      }));
    },
    enabled: !!activeConfigId && isTwoWayConversation,
    refetchInterval: 30_000,
  });

  const activeSubmissions: Submission[] = isTwoWayConversation ? (dualSubmissions ?? []) : (submissions ?? []);
  const loadingActiveSubmissions = isTwoWayConversation ? loadingDualSubmissions : loadingSubmissions;

  const isThoughtPartner = selectedConfig?.type === 'thought-partner';
  const allBullets = activeSubmissions.flatMap(s => s.feedback?.bullets ?? []).filter(Boolean);

  const { data: themes } = useQuery<{ positive: string; constructive: string }>({
    queryKey: ['/api/analyze-themes', activeConfigId, allBullets.length],
    queryFn: async () => {
      const res = await fetch('/api/analyze-themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedbacks: activeSubmissions.map(s => s.feedback).filter(Boolean) }),
      });
      if (!res.ok) return { positive: '', constructive: '' };
      return res.json();
    },
    enabled: !isThoughtPartner && allBullets.length > 0,
    staleTime: 60_000,
  });

  if (!token) return <ErrorScreen message="No session token provided." />;
  if (isLoading) return <div className="h-screen flex items-center justify-center text-gray-400">Loading...</div>;
  if (!sessionData) return <ErrorScreen message="Session not found." />;

  const withFeedback = isThoughtPartner
    ? activeSubmissions.filter(s => s.feedback?.thinkingMap != null)
    : activeSubmissions.filter(s => s.feedback && s.feedback.score !== null);
  const avgScore = !isThoughtPartner && withFeedback.length > 0
    ? withFeedback.reduce((sum, s) => sum + (s.feedback!.score ?? 0), 0) / withFeedback.length
    : null;

  // Collect key themes from thought-partner thinking maps
  const tpKeyThemes = isThoughtPartner
    ? [...new Set(activeSubmissions.flatMap(s => s.feedback?.thinkingMap?.keyThemes ?? []))]
    : [];

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 flex-shrink-0">
        <img src="/womble-icon.svg" alt="Womble" className="h-6 w-6" />
        <span className="font-semibold text-green-700">Womble</span>
        <span className="text-gray-300 mx-1">·</span>
        <span className="text-sm text-gray-500">Session Feedback</span>
        {sessionData?.title && (
          <>
            <span className="text-gray-300 mx-1">–</span>
            <span className="text-sm font-bold text-gray-800">{sessionData.title}</span>
          </>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-56 flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto">
          <div className="px-3 pt-4 pb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Activities</p>
          </div>
          <nav className="px-2 pb-4 space-y-1">
            {sessionData.configs.map((cfg) => (
              <button
                key={cfg.id}
                onClick={() => setSelectedConfigId(cfg.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  cfg.id === activeConfigId
                    ? 'bg-green-50 text-green-800 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="truncate block">{cfg.title}</span>
                <span className="text-xs text-gray-400">{cfg.type}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {!selectedConfig ? (
            <div className="text-center text-gray-400 text-sm py-16">Select an activity from the sidebar.</div>
          ) : selectedConfig.type === 'group-board' ? (
            <div className="flex-1 overflow-hidden">
              <GroupBoardInterface
                config={{
                  id: selectedConfig.id,
                  type: 'group-board',
                  title: selectedConfig.title,
                  systemPrompt: selectedConfig.systemPrompt || '',
                  userInstructions: selectedConfig.userInstructions || '',
                  feedbackCriteria: selectedConfig.feedbackCriteria || '',
                  groupBoardSettings: selectedConfig.groupBoardSettings,
                }}
                userName="Trainer"
                isAdmin={true}
              />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6">
            <>
              <div className={`flex items-center gap-3 mb-6 ${selectedConfig.type === 'quick-fire-quiz' ? 'justify-center' : ''}`}>
                <h1 className="text-xl font-bold text-gray-900">{selectedConfig.title}</h1>
                <Badge variant="outline">{selectedConfig.type}</Badge>
                {!isThoughtPartner && selectedConfig.type !== 'quick-fire-quiz' && avgScore !== null && (
                  <span className="ml-auto text-sm font-medium text-gray-600">
                    Avg score: <span className="text-green-700">{avgScore.toFixed(1)}/10</span>
                  </span>
                )}
                {selectedConfig.type !== 'quick-fire-quiz' && (
                  <span className={`text-sm text-gray-400 ${isThoughtPartner || avgScore === null ? 'ml-auto' : ''}`}>
                    {activeSubmissions.length} submission{activeSubmissions.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {selectedConfig.type === 'quick-fire-quiz' ? (
                <div className="max-w-lg mx-auto">
                  <QuickFireQuizAnalysis configId={activeConfigId!} />
                </div>
              ) : loadingActiveSubmissions ? (
                <div className="text-gray-400 text-sm">Loading submissions...</div>
              ) : activeSubmissions.length === 0 ? (
                <div className="text-center py-16 text-gray-400 text-sm">No submissions yet for this activity.</div>
              ) : (
                <div className="space-y-4">
                  {/* Analysis Summary */}
                  {activeSubmissions.some(s => s.feedback) && (
                    <Card className="bg-white">
                      <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
                        <CollapsibleTrigger asChild>
                          <CardHeader className="pb-2 cursor-pointer hover:bg-gray-50 transition-colors rounded-t-lg">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-blue-600" />
                                <span className="font-semibold text-base">Analysis Summary</span>
                              </div>
                              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${summaryOpen ? 'rotate-180' : ''}`} />
                            </div>
                          </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <CardContent className="pt-0">
                            <div className={`grid ${!isThoughtPartner && avgScore !== null ? 'grid-cols-2' : 'grid-cols-1'} gap-6 pb-4`}>
                              <div>
                                <p className="text-xs font-medium text-gray-500 mb-1">{isThoughtPartner ? 'Completion Coverage' : 'Feedback Coverage'}</p>
                                <p className="text-2xl font-bold text-blue-900">{withFeedback.length}/{activeSubmissions.length}</p>
                                <p className="text-xs text-gray-500">{isThoughtPartner ? 'summaries generated' : 'submissions with feedback'}</p>
                              </div>
                              {!isThoughtPartner && avgScore !== null && (
                                <div>
                                  <p className="text-xs font-medium text-gray-500 mb-1">Average Score</p>
                                  <p className="text-2xl font-bold text-blue-900">{avgScore.toFixed(1)}/10</p>
                                  <p className="text-xs text-gray-500">across all feedback</p>
                                </div>
                              )}
                            </div>
                            {isThoughtPartner && tpKeyThemes.length > 0 && (
                              <div className="border-t pt-4">
                                <p className="text-xs font-medium text-gray-500 mb-2">Key Themes Across All Discussions</p>
                                <ul className="space-y-1">
                                  {tpKeyThemes.map((theme, i) => (
                                    <li key={i} className="text-sm text-gray-700 flex gap-2">
                                      <span className="text-blue-400 flex-shrink-0 mt-0.5">•</span>{theme}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {!isThoughtPartner && themes && (themes.positive || themes.constructive) && (
                              <div className="border-t pt-4 space-y-3">
                                <p className="text-xs font-medium text-gray-500">Key Themes</p>
                                {themes.positive && (
                                  <div>
                                    <p className="text-xs font-semibold text-green-600 mb-0.5">Positive theme:</p>
                                    <p className="text-sm text-gray-800">{themes.positive}</p>
                                  </div>
                                )}
                                {themes.constructive && (
                                  <div>
                                    <p className="text-xs font-semibold text-amber-600 mb-0.5">Constructive theme:</p>
                                    <p className="text-sm text-gray-800">{themes.constructive}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </CollapsibleContent>
                      </Collapsible>
                    </Card>
                  )}

                  {/* Individual submissions */}
                  {activeSubmissions.map((s) => (
                    isThoughtPartner ? (
                      <ThoughtPartnerSubmissionCard key={s.sessionId} submission={s} />
                    ) : (
                      <Card key={s.sessionId}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">{s.userName || 'Anonymous'}</CardTitle>
                            <div className="flex items-center gap-2">
                              {s.chatMode && (
                                <Badge variant="outline" className="text-xs">{s.chatMode}</Badge>
                              )}
                              {s.feedback?.score != null && (
                                <span className={`text-sm font-semibold ${
                                  s.feedback.score >= 7 ? 'text-green-600' :
                                  s.feedback.score >= 4 ? 'text-amber-600' : 'text-red-500'
                                }`}>
                                  {s.feedback.score}/10
                                </span>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {s.feedback ? (
                            <>
                              {s.feedback.summary && (
                                <p className="text-sm text-gray-600 mb-3">{s.feedback.summary}</p>
                              )}
                              {s.feedback.bullets && s.feedback.bullets.length > 0 && (
                                <ul className="space-y-1.5">
                                  {s.feedback.bullets.map((b, i) => {
                                    const { emoji, rest } = extractTrafficLight(b);
                                    return (
                                      <li key={i} className="text-sm text-gray-700 flex gap-2">
                                        <span className="flex-shrink-0 w-5 text-center">{emoji ?? '·'}</span>
                                        <span>{rest}</span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </>
                          ) : (
                            <p className="text-sm text-gray-400 italic">No feedback yet.</p>
                          )}
                        </CardContent>
                      </Card>
                    )
                  ))}
                </div>
              )}
            </>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ThoughtPartnerSubmissionCard({ submission: s }: { submission: Submission }) {
  const [open, setOpen] = useState(false);
  const tm = s.feedback?.thinkingMap;

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors rounded-lg py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-teal-600 flex-shrink-0" />
                <span className="font-medium text-base">{s.userName || 'Anonymous'}</span>
              </div>
              <div className="flex items-center gap-2">
                {s.chatMode && <Badge variant="outline" className="text-xs">{s.chatMode}</Badge>}
                {tm ? (
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                ) : (
                  <span className="text-xs text-gray-400 italic">No summary yet</span>
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        {tm && (
          <CollapsibleContent>
            <CardContent className="pt-0 pb-4 space-y-3">
              {tm.keyThemes?.length > 0 && <TPMapSection color="blue" title="Key Themes Explored" items={tm.keyThemes} />}
              {tm.insights?.length > 0 && <TPMapSection color="yellow" title="Insights Reached" items={tm.insights} />}
              {tm.openQuestions?.length > 0 && <TPMapSection color="purple" title="Open Questions" items={tm.openQuestions} />}
              {tm.nextSteps?.length > 0 && <TPMapSection color="green" title="Suggested Next Steps" items={tm.nextSteps} />}
            </CardContent>
          </CollapsibleContent>
        )}
      </Collapsible>
    </Card>
  );
}

const tpSectionColors = {
  blue:   { card: 'bg-blue-50 border-blue-100',   dot: 'bg-blue-400' },
  yellow: { card: 'bg-yellow-50 border-yellow-100', dot: 'bg-yellow-400' },
  purple: { card: 'bg-purple-50 border-purple-100', dot: 'bg-purple-400' },
  green:  { card: 'bg-green-50 border-green-100',  dot: 'bg-green-500' },
} as const;

function TPMapSection({ color, title, items }: { color: keyof typeof tpSectionColors; title: string; items: string[] }) {
  const { card, dot } = tpSectionColors[color];
  return (
    <div className={`rounded-lg border p-3 ${card}`}>
      <p className="font-semibold text-xs text-gray-600 mb-2">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
            <span className={`mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0 ${dot}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuickFireQuizAnalysis({ configId }: { configId: number }) {
  const [showReview, setShowReview] = useState(false);

  const { data: leaderboard, refetch } = useQuery<{ entries: any[] }>({
    queryKey: ["/api/quick-fire-quiz", configId, "leaderboard", "analysis"],
    queryFn: async () => {
      const res = await fetch(`/api/quick-fire-quiz/${configId}/leaderboard`);
      if (!res.ok) return { entries: [] };
      return res.json();
    },
    refetchInterval: 15_000,
  });

  const { data: config } = useQuery<any>({
    queryKey: [`/api/chat-configs/${configId}`],
    queryFn: async () => {
      const res = await fetch(`/api/chat-configs/${configId}`);
      if (!res.ok) return null;
      return res.json();
    },
  });

  const entries = leaderboard?.entries ?? [];
  const questions: any[] = config?.quickFireQuestions ?? [];
  const maxScore = questions.length * 1000;
  const LABELS = ['A', 'B', 'C', 'D'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{entries.length} participant{entries.length !== 1 ? 's' : ''}</span>
        {questions.length > 0 && (
          <button
            onClick={() => setShowReview(v => !v)}
            className={`text-sm px-3 py-1 rounded-full border transition-colors ${showReview ? 'bg-green-50 border-green-300 text-green-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
          >
            {showReview ? 'Hide Review' : 'Question Review'}
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No quiz results yet.</div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, i) => (
            <div key={entry.participantId} className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-100 rounded-lg">
              <span className="w-7 text-center text-lg">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-sm text-gray-400">#{i + 1}</span>}
              </span>
              <span className="flex-1 font-medium text-gray-800">{entry.userName || 'Anonymous'}</span>
              <span className="text-sm font-semibold text-gray-700">
                {entry.totalPoints}{maxScore > 0 ? `/${maxScore}` : ''}
              </span>
            </div>
          ))}
          <button
            onClick={() => refetch()}
            className="w-full border border-gray-200 rounded-lg py-2 text-sm text-gray-400 hover:bg-gray-50 transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
      )}

      {showReview && questions.length > 0 && (
        <div className="mt-2 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-2">Question Review</p>
          {questions.map((q: any, qi: number) => (
            <div key={q.id} className="border border-gray-100 rounded-lg p-3 space-y-2 bg-white">
              <p className="text-sm font-semibold text-gray-800">Q{qi + 1}. {q.question}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(q.options ?? []).map((opt: string, oi: number) => {
                  const isCorrect = oi === q.correctIndex;
                  return (
                    <div
                      key={oi}
                      className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-xs ${isCorrect ? 'bg-green-50 border border-green-300 text-green-800 font-medium' : 'bg-gray-50 text-gray-500'}`}
                    >
                      <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${isCorrect ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
                        {LABELS[oi]}
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
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <div className="flex items-center gap-2 text-red-600 text-sm">
        <AlertCircle className="h-4 w-4" />
        <span>{message}</span>
      </div>
    </div>
  );
}
