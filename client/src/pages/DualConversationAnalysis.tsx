import { useState, useEffect } from "react";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { MessageSquare, TrendingUp, ChevronDown } from "lucide-react";
import type { AdminConfig } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface ParticipantFeedback {
  bullets: string[];
  score: number;
  summary: string | null;
}

interface DualConversationFeedback {
  participant1: ParticipantFeedback;
  participant2: ParticipantFeedback;
  overall: {
    bullets: string[];
    summary: string | null;
  };
}

interface TranscriptEntry {
  role: 'participant1' | 'participant2';
  content: string;
  timestamp: number;
}

interface DualConversationData {
  sessionId: string;
  participant1Name: string;
  participant2Name: string;
  transcript: TranscriptEntry[];
  feedback: DualConversationFeedback;
  createdAt: string;
}

interface FeedbackSummary {
  feedbackCount: number;
  totalCount: number;
  averageScore: {
    participant1: number;
    participant2: number;
  };
  keyThemes?: {
    positive: string;
    constructive: string;
  };
}

export default function DualConversationAnalysis() {
  const [conversations, setConversations] = useState<DualConversationData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const { toast } = useToast();

  const searchParams = new URLSearchParams(window.location.search);
  const configId = searchParams.get('configId');

  const { data: config } = useQuery<AdminConfig>({
    queryKey: [`/api/chat-configs/${configId}`],
    enabled: !!configId,
  });

  // No longer need toggleTranscript as we're opening in a new tab

  const generateSummary = async (conversationsData: DualConversationData[]): Promise<FeedbackSummary> => {
    const withFeedback = conversationsData.filter(conv => 
      conv.feedback && 
      conv.feedback.participant1 && 
      conv.feedback.participant2
    );
    
    const feedbackCount = withFeedback.length;
    const totalCount = conversationsData.length;

    // Calculate average scores
    let participant1TotalScore = 0;
    let participant2TotalScore = 0;
    
    withFeedback.forEach(conv => {
      participant1TotalScore += conv.feedback.participant1.score || 0;
      participant2TotalScore += conv.feedback.participant2.score || 0;
    });

    const averageScore = {
      participant1: feedbackCount > 0 ? participant1TotalScore / feedbackCount : 0,
      participant2: feedbackCount > 0 ? participant2TotalScore / feedbackCount : 0
    };

    let themes = {
      positive: "No positive themes identified yet",
      constructive: "No constructive feedback available yet"
    };

    // Get themes from all feedback points
    if (withFeedback.length > 0) {
      try {
        // Collect all feedback bullets from participants and overall feedback
        const allFeedbacks = withFeedback.flatMap(conv => {
          const p1Bullets = conv.feedback.participant1?.bullets || [];
          const p2Bullets = conv.feedback.participant2?.bullets || [];
          const overallBullets = conv.feedback.overall?.bullets || [];
          return [...p1Bullets, ...p2Bullets, ...overallBullets];
        });

        const response = await fetch('/api/analyze-themes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            feedbacks: [{ bullets: allFeedbacks }]
          }),
        });

        if (response.ok) {
          const data = await response.json();
          themes = {
            positive: data.positive || "No positive themes identified yet",
            constructive: data.constructive || "No constructive feedback available yet"
          };
        }
      } catch (error) {
        console.error('Error analyzing themes:', error);
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
      if (!configId) return;

      try {
        setIsLoading(true);

        const response = await fetch(`/api/dual-conversations/${configId}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch dual conversations: ${await response.text()}`);
        }
        const conversationsData = await response.json();

        if (!Array.isArray(conversationsData)) {
          throw new Error("Invalid conversations data format");
        }

        setConversations(conversationsData);
        const summaryData = await generateSummary(conversationsData);
        setSummary(summaryData);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configId, toast]);

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto">
        <div className="sticky top-0 z-10 p-4 md:p-8 pb-4">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-blue-900">
              Dual Conversation Analysis
            </h1>
          </div>

          {summary && (
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
              <Card className="mb-2 bg-white">
                <CardHeader className="pb-4">
                  <CollapsibleTrigger className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-blue-600" />
                      <h2 className="text-xl font-semibold">Analysis Summary</h2>
                    </div>
                    <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
                  </CollapsibleTrigger>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent>
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                          <h3 className="text-sm font-medium text-gray-500">Feedback Coverage</h3>
                          <p className="text-2xl font-bold text-blue-900">{summary.feedbackCount}/{summary.totalCount}</p>
                          <p className="text-sm text-gray-600">conversations with feedback</p>
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-sm font-medium text-gray-500">Participant 1 Avg. Score</h3>
                          <p className="text-2xl font-bold text-blue-900">
                            {summary.averageScore.participant1.toFixed(1)}/10
                          </p>
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-sm font-medium text-gray-500">Participant 2 Avg. Score</h3>
                          <p className="text-2xl font-bold text-blue-900">
                            {summary.averageScore.participant2.toFixed(1)}/10
                          </p>
                        </div>
                      </div>
                      
                      {summary.keyThemes && (
                        <div className="mt-6 border-t pt-6">
                          <h3 className="text-sm font-medium text-gray-500 mb-4">Key Themes</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                              <h4 className="text-sm font-semibold text-green-700 mb-2">What's Working Well</h4>
                              <p className="text-sm text-green-800">{summary.keyThemes.positive}</p>
                            </div>
                            <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
                              <h4 className="text-sm font-semibold text-amber-700 mb-2">Areas for Improvement</h4>
                              <p className="text-sm text-amber-800">{summary.keyThemes.constructive}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}
        </div>

        <div className="px-4 md:px-8 pb-8">
          {isLoading ? (
            <Card>
              <CardContent className="p-6">
                <div className="animate-pulse text-center">
                  Analyzing dual conversations...
                </div>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[calc(100vh-16rem)]">
              <div className="space-y-4">
                {conversations.length > 0 ? (
                  conversations.map((conversation) => (
                    <Card key={conversation.sessionId}>
                      <CardHeader>
                        <div className="flex justify-between items-center">
                          <h2 className="text-lg font-semibold">
                            {conversation.participant1Name} & {conversation.participant2Name}
                          </h2>
                          <p className="text-sm text-gray-500">
                            {new Date(conversation.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-6">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="text-md font-semibold">Participants</h3>
                              <p className="text-sm text-gray-500 mt-1">
                                <span className="font-medium">Participant 1:</span> {conversation.participant1Name}<br />
                                <span className="font-medium">Participant 2:</span> {conversation.participant2Name}
                              </p>
                            </div>
                            
                            <div className="text-xl font-bold text-blue-900 flex items-center">
                              Score: {Math.round(((conversation.feedback?.participant1?.score || 0) + (conversation.feedback?.participant2?.score || 0)) / 2)}/10
                            </div>
                          </div>
                          
                          <div className="space-y-4">
                            {conversation.feedback?.overall?.bullets && Array.isArray(conversation.feedback.overall.bullets) && (
                              <div className="space-y-2">
                                <h3 className="text-md font-semibold">Key Points</h3>
                                {conversation.feedback.overall.bullets.map((bullet, bulletIndex) => (
                                  <div key={bulletIndex} className="flex items-start gap-2 text-sm">
                                    <span>•</span>
                                    <span>{bullet}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {conversation.feedback?.overall?.summary && (
                              <div className="border-t pt-4">
                                <h3 className="text-md font-semibold mb-2">Summary</h3>
                                <div className="bg-blue-50 p-4 rounded-lg">
                                  <p className="text-sm text-blue-700">
                                    {conversation.feedback.overall.summary}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter className="justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-2"
                          onClick={() => window.open(`/transcript/${configId}/${conversation.sessionId}`, '_blank')}
                        >
                          <MessageSquare className="h-4 w-4" />
                          View Transcript
                        </Button>
                      </CardFooter>
                      

                    </Card>
                  ))
                ) : (
                  <Card>
                    <CardContent className="p-6">
                      <div className="text-center text-muted-foreground">
                        No dual conversations available yet.
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}