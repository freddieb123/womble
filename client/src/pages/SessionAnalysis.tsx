import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, BarChart2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type SessionConfig = {
  id: number;
  title: string;
  type: string;
  isLive: boolean;
};

type SessionData = {
  id: number;
  shareToken: string;
  configs: SessionConfig[];
};

type ConversationFeedback = {
  bullets: string[];
  score: number | null;
  summary: string | null;
};

type Submission = {
  sessionId: string;
  userName: string | null;
  chatMode?: string | null;
  feedback: ConversationFeedback | null;
  messages?: any[];
};

export default function SessionAnalysis() {
  const { user } = useAuth();
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get('token');
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);

  const { data: sessionData, isLoading } = useQuery<SessionData>({
    queryKey: [`/api/sessions/join/${token}`],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/join/${token}`);
      if (!res.ok) throw new Error('Session not found');
      return res.json();
    },
    enabled: !!token,
    staleTime: 30_000,
  });

  const activeConfigId = selectedConfigId ?? sessionData?.configs[0]?.id ?? null;

  const { data: submissions, isLoading: loadingSubmissions } = useQuery<Submission[]>({
    queryKey: [`/api/conversations/${activeConfigId}`],
    queryFn: async () => {
      const res = await fetch(`/api/conversations/${activeConfigId}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!activeConfigId,
    refetchInterval: 30_000,
  });

  if (!token) return <ErrorScreen message="No session token provided." />;
  if (isLoading) return <div className="h-screen flex items-center justify-center text-gray-400">Loading...</div>;
  if (!sessionData) return <ErrorScreen message="Session not found." />;

  const selectedConfig = sessionData.configs.find(c => c.id === activeConfigId);
  const withFeedback = (submissions ?? []).filter(s => s.feedback && s.feedback.score !== null);
  const avgScore = withFeedback.length > 0
    ? withFeedback.reduce((sum, s) => sum + (s.feedback!.score ?? 0), 0) / withFeedback.length
    : null;

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 flex-shrink-0">
        <img src="/womble-icon.svg" alt="Womble" className="h-6 w-6" />
        <span className="font-semibold text-green-700">Womble</span>
        <span className="text-gray-300 mx-1">·</span>
        <span className="text-sm text-gray-500">Session Feedback</span>
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
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedConfig ? (
            <div className="text-center text-gray-400 text-sm py-16">Select an activity from the sidebar.</div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6">
                <h1 className="text-xl font-bold text-gray-900">{selectedConfig.title}</h1>
                <Badge variant="outline">{selectedConfig.type}</Badge>
                {avgScore !== null && (
                  <span className="ml-auto text-sm font-medium text-gray-600">
                    Avg score: <span className="text-green-700">{avgScore.toFixed(1)}</span>
                  </span>
                )}
                <span className="text-sm text-gray-400">{(submissions ?? []).length} submission{(submissions ?? []).length !== 1 ? 's' : ''}</span>
              </div>

              {loadingSubmissions ? (
                <div className="text-gray-400 text-sm">Loading submissions...</div>
              ) : (submissions ?? []).length === 0 ? (
                <div className="text-center py-16 text-gray-400 text-sm">No submissions yet for this activity.</div>
              ) : (
                <div className="space-y-4">
                  {(submissions ?? []).map((s) => (
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
                                s.feedback.score >= 70 ? 'text-green-600' :
                                s.feedback.score >= 40 ? 'text-amber-600' : 'text-red-500'
                              }`}>
                                {s.feedback.score}/100
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
                              <ul className="space-y-1">
                                {s.feedback.bullets.map((b, i) => (
                                  <li key={i} className="text-sm text-gray-700 flex gap-2">
                                    <span className="text-gray-300 flex-shrink-0">·</span>
                                    <span>{b}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </>
                        ) : (
                          <p className="text-sm text-gray-400 italic">No feedback yet.</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
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
