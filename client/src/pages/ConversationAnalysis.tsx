import { useState, useEffect } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { MessageSquare, TrendingUp, ChevronDown } from "lucide-react";
import type { Message, AdminConfig } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
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

interface ConversationData {
  messages: Message[];
  userName: string;
  sessionId: string;
  feedback: ConversationFeedback | null;
}

interface FeedbackSummary {
  feedbackCount: number;
  totalCount: number;
  averageScore: number;
  keyThemes: {
    positive: string;
    constructive: string[];
  };
}

export default function ConversationAnalysis() {
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [feedbacks, setFeedbacks] = useState<ConversationFeedback[]>([]);
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

  const generateSummary = (conversationsData: ConversationData[]): FeedbackSummary => {
      const withFeedback = conversationsData.filter(conv => conv.feedback !== null);
      const feedbackCount = withFeedback.length;
      const totalCount = conversationsData.length;

      const totalScore = withFeedback.reduce((sum, conv) => 
        sum + (conv.feedback?.score || 0), 0);
      const averageScore = feedbackCount > 0 ? totalScore / feedbackCount : 0;

      const allBullets = withFeedback
        .flatMap(conv => conv.feedback?.bullets || [])
        .map(bullet => {
          // Convert second person to third person
          return bullet.toLowerCase()
            .replace(/\byou\b/g, 'learners')
            .replace(/\byour\b/g, 'their')
            .replace(/\byourself\b/g, 'themselves');
        });

      // Keywords that indicate clear positive or constructive feedback
      const positiveKeywords = ['excellent', 'effective', 'successfully', 'well done', 'strong'];
      const constructiveKeywords = ['could improve', 'should consider', 'need to', 'would benefit from', 'lacking'];

      // Filter for single-point feedback
      const positiveBullets = allBullets
        .filter(bullet => {
          const hasPositive = positiveKeywords.some(keyword => bullet.includes(keyword));
          const isCleanPositive = !bullet.includes('but') && 
                                !bullet.includes('however') && 
                                !bullet.includes('could') &&
                                !bullet.includes('should');
          return hasPositive && isCleanPositive;
        })
        .map(bullet => {
          // Extract the main point before any qualifying statements
          const mainPoint = bullet.split(/[,.]/).find(part => 
            positiveKeywords.some(keyword => part.includes(keyword)) &&
            part.length > 20  // Ensure it's a complete thought
          );
          return mainPoint?.trim() || bullet;
        });

      const constructiveBullets = allBullets
        .filter(bullet => {
          const hasConstructive = constructiveKeywords.some(keyword => bullet.includes(keyword));
          const isCleanConstructive = !bullet.includes('well done') && 
                                    !bullet.includes('excellent') &&
                                    (bullet.includes('need') || 
                                     bullet.includes('should') || 
                                     bullet.includes('could'));
          return hasConstructive && isCleanConstructive;
        })
        .map(bullet => {
          // Extract the main constructive point that includes the improvement suggestion
          const mainPoint = bullet.split(/[,.]/).find(part => 
            constructiveKeywords.some(keyword => part.includes(keyword)) &&
            part.length > 20  // Ensure it's a complete thought
          );
          return mainPoint?.trim() || bullet;
        });

      const positiveTheme = positiveBullets.length > 0 ?
        positiveBullets[Math.floor(Math.random() * positiveBullets.length)] :
        "Learners demonstrated effective communication skills";

      const constructiveTheme = constructiveBullets.length > 0 ?
        constructiveBullets[0] :
        "Learners should work on providing more specific examples in their responses";

      return {
        feedbackCount,
        totalCount,
        averageScore,
        keyThemes: {
          positive: positiveTheme,
          constructive: [constructiveTheme]
        }
      };
    };

  useEffect(() => {
    const fetchAndAnalyze = async () => {
      if (!configId || !config?.feedbackCriteria) return;

      try {
        setIsLoading(true);

        const conversationsResponse = await fetch(`/api/conversations/${configId}`);
        if (!conversationsResponse.ok) {
          throw new Error(`Failed to fetch conversations: ${await conversationsResponse.text()}`);
        }
        const conversationsData = await conversationsResponse.json();

        if (!Array.isArray(conversationsData) || conversationsData.length === 0) {
          throw new Error("No conversations found");
        }

        setConversations(conversationsData);
        setSummary(generateSummary(conversationsData));

        if (config.type === 'upload') {
          const existingFeedbacks = conversationsData.map(conv => conv.feedback).filter(f => f !== null);
          setFeedbacks(existingFeedbacks);
        }

      } catch (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to analyze conversations",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchAndAnalyze();
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto">
        <div className="sticky top-0 z-10 bg-gradient-to-b from-blue-50 to-white p-4 md:p-8 pb-4">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-blue-900">
              {config?.type === 'upload' ? 'Upload Analysis' : 'Conversation Analysis'}
            </h1>
          </div>

          {summary && (
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
              <Card className="mb-2">
                <CardHeader className="pb-2">
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
                      <div className="border-t pt-4">
                        <h3 className="text-sm font-medium text-gray-500 mb-3">Key Themes</h3>
                        <div className="space-y-3">
                          <div className="text-sm text-gray-900">
                            {summary.keyThemes.positive}
                          </div>
                          <div className="text-sm text-gray-900">
                            {summary.keyThemes.constructive[0]}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}
        </div>

        <div className="px-4 md:px-8">
          {isLoading ? (
            <Card>
              <CardContent className="p-6">
                <div className="animate-pulse text-center">
                  {config?.type === 'upload' ? 'Analyzing uploads...' : 'Analyzing conversations...'}
                </div>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[calc(100vh-16rem)]">
              <div className="space-y-4">
                {conversations.map((conversation, index) => (
                  <Card key={conversation.sessionId || index}>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <h2 className="text-lg font-semibold">
                        {conversation.userName ? 
                          `${conversation.userName}'s ${config?.type === 'upload' ? 'Upload' : 'Conversation'}` : 
                          `Anonymous ${config?.type === 'upload' ? 'Upload' : 'Conversation'} ${index + 1}`}
                      </h2>
                      {config?.type === 'chat' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-2"
                          onClick={() => {
                            window.open(`/conversation?configId=${configId}&sessionId=${conversation.sessionId}`, '_blank');
                          }}
                        >
                          <MessageSquare className="h-4 w-4" />
                          Open Conversation
                        </Button>
                      )}
                    </CardHeader>
                    <CardContent>
                      {conversation.feedback ? (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            {conversation.feedback.bullets.map((bullet, bulletIndex) => (
                              <div key={bulletIndex} className="flex items-start gap-2 text-sm">
                                <span>•</span>
                                <span>{bullet}</span>
                              </div>
                            ))}
                          </div>
                          <div className="border-t pt-4">
                            <div className="flex flex-col gap-2 bg-blue-50 p-4 rounded-lg">
                              <span className="text-2xl font-bold text-blue-900">
                                {conversation.feedback.score}/10
                              </span>
                              {conversation.feedback.summary && (
                                <p className="text-sm text-blue-700">
                                  {conversation.feedback.summary}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">No feedback available for this {config?.type === 'upload' ? 'upload' : 'conversation'}.</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}