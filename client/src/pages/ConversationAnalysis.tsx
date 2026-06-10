import { useState, useEffect } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { MessageSquare, TrendingUp, ChevronDown, Mic, Keyboard } from "lucide-react";
import type { Message, AdminConfig } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import QuizResponseView from "@/components/QuizResponseView";
import { ParticipantCount, LiveLeaderboard } from "@/components/LiveActivityPanel";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ConversationFeedback {
  bullets: string[];
  score: number | null;
  summary: string | null;
}

interface QuizResponse {
  sessionId: string;
  userName: string;
  feedback: Record<number, {
    status: "correct" | "almost" | "incorrect";
    feedback: string;
    answer?: string;
  }>;
}

interface ConversationData {
  messages: Message[];
  userName: string;
  sessionId: string;
  attemptNumber?: number;
  chatMode: string | null;
  feedback: ConversationFeedback;
}

interface LearnerGroup {
  sessionId: string;
  userName: string;
  attempts: ConversationData[];
  bestScore: number | null;
}

interface FeedbackSummary {
  feedbackCount: number;
  totalCount: number;
  averageScore: number;
  keyThemes: {
    positive: string;
    constructive: string;
  };
}

export default function ConversationAnalysis() {
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [quizResponses, setQuizResponses] = useState<QuizResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const searchParams = new URLSearchParams(window.location.search);
  const configId = searchParams.get('configId');

  const { data: config } = useQuery<AdminConfig>({
    queryKey: [`/api/chat-configs/${configId}`],
    enabled: !!configId,
  });

  const generateSummary = async (conversationsData: ConversationData[]): Promise<FeedbackSummary> => {
    const withFeedback = conversationsData.filter(conv => conv.feedback && conv.feedback.score !== null);
    const feedbackCount = withFeedback.length;
    const totalCount = conversationsData.length;

    const totalScore = withFeedback.reduce((sum, conv) => sum + (conv.feedback?.score || 0), 0);
    const averageScore = feedbackCount > 0 ? totalScore / feedbackCount : 0;

    let themes = {
      positive: "No feedback available yet",
      constructive: "No feedback available yet"
    };

    if (withFeedback.length > 0) {
      try {
        const response = await fetch('/api/analyze-themes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            feedbacks: withFeedback.map(conv => ({
              ...conv.feedback,
              bullets: conv.feedback?.bullets || []
            }))
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        themes = {
          positive: data.positive || "Error analyzing themes",
          constructive: data.constructive || "Error analyzing themes"
        };
      } catch (error) {
        console.error('Error analyzing themes:', error);
        themes = {
          positive: "Error analyzing themes",
          constructive: "Error analyzing themes"
        };
      }
    }

    return {
      feedbackCount,
      totalCount,
      averageScore,
      keyThemes: themes
    };
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!configId || !config) return;

      try {
        setIsLoading(true);

        if (config.type === 'quiz') {
          const quizResponse = await fetch(`/api/quiz-responses/${configId}`);

          if (!quizResponse.ok) {
            if (quizResponse.status === 404) {
              setQuizResponses([]);
              return;
            }
            throw new Error(`Failed to fetch quiz responses: ${await quizResponse.text()}`);
          }

          const quizData = await quizResponse.json();
          console.log("Received quiz responses:", quizData);

          if (!Array.isArray(quizData)) {
            throw new Error("Invalid quiz response data format");
          }

          const transformedResponses = quizData.map(response => ({
            sessionId: response.sessionId,
            userName: response.userName || 'Anonymous',
            feedback: response.feedback || {}
          }));

          setQuizResponses(transformedResponses);
        } else {
          const conversationsResponse = await fetch(`/api/conversations/${configId}`);
          if (!conversationsResponse.ok) {
            throw new Error(`Failed to fetch conversations: ${await conversationsResponse.text()}`);
          }
          const conversationsData = await conversationsResponse.json();

          if (!Array.isArray(conversationsData)) {
            throw new Error("Invalid conversations data format");
          }

          // Transform data to ensure feedback is never null
          const transformedData = conversationsData.map(conv => ({
            ...conv,
            feedback: conv.feedback || {
              bullets: [],
              score: null,
              summary: null
            }
          }));

          // Sort by score descending (no feedback goes to the bottom)
          const sorted = [...transformedData].sort((a, b) => {
            const sa = a.feedback?.score ?? -1;
            const sb = b.feedback?.score ?? -1;
            return sb - sa;
          });
          setConversations(sorted);
          const summaryData = await generateSummary(transformedData);
          setSummary(summaryData);
        }
      } catch (error) {
        console.error('Fetch error:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to load data",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [configId, config, toast]);

  if (!configId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardContent className="p-6">
              <div className="text-center text-red-600">No config ID provided</div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const showLiveStats = config?.type === 'chat' || config?.type === 'teach-ai';
  const isThoughtPartner = config?.type === 'thought-partner';

  // Group conversations by sessionId for multi-attempt display
  const learnerGroups: LearnerGroup[] = (() => {
    const grouped = new Map<string, LearnerGroup>();
    conversations.forEach((conv, index) => {
      const key = conv.sessionId || String(index);
      if (!grouped.has(key)) {
        grouped.set(key, {
          sessionId: key,
          userName: conv.userName || `Anonymous ${config?.type === 'upload' ? 'Upload' : 'Participant'} ${grouped.size + 1}`,
          attempts: [],
          bestScore: null,
        });
      }
      const group = grouped.get(key)!;
      group.attempts.push(conv);
      const s = conv.feedback?.score ?? null;
      if (s !== null && (group.bestScore === null || s > group.bestScore)) group.bestScore = s;
    });
    grouped.forEach(g => g.attempts.sort((a, b) => (b.attemptNumber ?? 1) - (a.attemptNumber ?? 1)));
    return Array.from(grouped.values());
  })();

  const centerContent = (
    <>
      <div className="sticky top-0 z-10 pb-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-blue-900">
            {config?.type === 'upload' ? 'Upload Analysis'
              : config?.type === 'quiz' ? 'Quiz Analysis'
              : config?.type === 'thought-partner' ? 'Thought Partner Activity'
              : 'Chat with an Agent Analysis'}
          </h1>
        </div>

        {summary && config?.type !== 'quiz' && !isThoughtPartner && (
          <Card className="mb-2 bg-white">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-600" />
                <h2 className="text-xl font-semibold">Analysis Summary</h2>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-gray-500">Feedback Coverage</h3>
                    <p className="text-2xl font-bold text-blue-900">{summary.feedbackCount}/{summary.totalCount}</p>
                    <p className="text-sm text-gray-600">conversations with feedback</p>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-gray-500">Average Score</h3>
                    <p className="text-2xl font-bold text-blue-900">
                      {summary.averageScore.toFixed(1)}/10
                    </p>
                    <p className="text-sm text-gray-600">across all feedback</p>
                  </div>
                </div>
                <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                  <div className="border-t pt-4">
                    <CollapsibleTrigger className="flex items-center justify-between w-full mb-3">
                      <h3 className="text-sm font-medium text-gray-500">Key Themes</h3>
                      <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-green-600">Positive theme:</h4>
                          <div className="text-sm text-gray-900">{summary.keyThemes.positive}</div>
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-amber-600">Constructive theme:</h4>
                          <div className="text-sm text-gray-900">{summary.keyThemes.constructive}</div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="pb-8">
        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              <div className="animate-pulse text-center">
                {config?.type === 'upload' ? 'Analyzing uploads...' : config?.type === 'quiz' ? 'Loading quiz responses...' : 'Analyzing chats...'}
              </div>
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="h-[calc(100vh-16rem)]">
            <div className="space-y-4">
              {config?.type === 'quiz' ? (
                <Card>
                  <CardContent className="p-6">
                    {quizResponses.length > 0 ? (
                      <QuizResponseView config={config} responses={quizResponses} />
                    ) : (
                      <div className="text-center text-muted-foreground">No quiz responses available yet.</div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                learnerGroups.map((group) => {
                    const multiAttempt = group.attempts.length > 1;
                    return (
                      <Collapsible key={group.sessionId}>
                        <Card>
                          <CollapsibleTrigger asChild>
                            <CardHeader className="flex flex-row items-center justify-between cursor-pointer hover:bg-gray-50/80 transition-colors rounded-t-lg py-4">
                              <div className="flex items-center gap-2 min-w-0">
                                <h2 className="text-base font-semibold truncate">{group.userName}</h2>
                                {multiAttempt && (
                                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 flex-shrink-0">
                                    {group.attempts.length} attempts
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0">
                                {!isThoughtPartner && group.bestScore !== null ? (
                                  <span className="text-lg font-bold text-blue-900">{group.bestScore}/10</span>
                                ) : !isThoughtPartner && group.attempts.every(a => !a.feedback?.score) ? (
                                  <span className="text-xs text-muted-foreground">No feedback yet</span>
                                ) : null}
                                <ChevronDown className="h-4 w-4 text-gray-400 transition-transform [[data-state=open]_&]:rotate-180" />
                              </div>
                            </CardHeader>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <CardContent className="pt-0 pb-4">
                              <div className="border-t pt-4 space-y-4">
                                {group.attempts.map((conversation, aIdx) => (
                                  <div key={conversation.attemptNumber ?? aIdx} className={multiAttempt ? 'border rounded-lg p-3' : ''}>
                                    {multiAttempt && (
                                      <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs font-semibold text-gray-500 uppercase">Attempt {conversation.attemptNumber ?? group.attempts.length - aIdx}</span>
                                        {conversation.chatMode === 'spoken' ? (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                                            <Mic className="h-3 w-3" />Voice
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                                            <Keyboard className="h-3 w-3" />Typed
                                          </span>
                                        )}
                                        {!isThoughtPartner && conversation.feedback?.score != null && (
                                          <span className="ml-auto text-sm font-bold text-blue-900">{conversation.feedback.score}/10</span>
                                        )}
                                      </div>
                                    )}
                                    {!multiAttempt && (
                                      <div className="flex items-center gap-2 mb-2">
                                        {conversation.chatMode === 'spoken' ? (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                                            <Mic className="h-3 w-3" />Voice
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                                            <Keyboard className="h-3 w-3" />Typed
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    {conversation.feedback?.bullets && conversation.feedback.bullets.length > 0 ? (
                                      <div className="space-y-2">
                                        {isThoughtPartner && <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Session Summary</p>}
                                        {conversation.feedback.bullets.map((bullet, bulletIndex) => (
                                          <div key={bulletIndex} className="flex items-start gap-2 text-sm">
                                            <span className="text-gray-400 mt-0.5">•</span><span>{bullet}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : isThoughtPartner ? (
                                      <p className="text-sm text-muted-foreground italic">No summary yet.</p>
                                    ) : null}
                                    {!isThoughtPartner && conversation.feedback?.summary && (
                                      <p className="text-sm text-blue-700 italic mt-2">{conversation.feedback.summary}</p>
                                    )}
                                    {config?.type === 'chat' && (
                                      <div className="pt-2">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="flex items-center gap-2"
                                          onClick={() => window.open(`/conversation?configId=${configId}&sessionId=${conversation.sessionId}&viewOnly=true`, '_blank')}
                                        >
                                          <MessageSquare className="h-4 w-4" />
                                          View Chat
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </CollapsibleContent>
                        </Card>
                      </Collapsible>
                    );
                  })
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    </>
  );

  if (showLiveStats && configId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
        <div className="flex gap-4 max-w-6xl mx-auto p-4 md:p-8 items-start">
          <div className="hidden lg:block w-44 flex-shrink-0 sticky top-8 pt-14">
            <ParticipantCount configId={parseInt(configId)} />
          </div>
          <div className="flex-1 min-w-0">
            {centerContent}
          </div>
          <div className="hidden lg:block w-44 flex-shrink-0 sticky top-8 pt-14">
            <LiveLeaderboard configId={parseInt(configId)} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto p-4 md:p-8">
        {centerContent}
      </div>
    </div>
  );
}