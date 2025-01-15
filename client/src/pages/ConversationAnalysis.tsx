import { useState, useEffect } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Message, AdminConfig } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";

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

export default function ConversationAnalysis() {
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [feedbacks, setFeedbacks] = useState<ConversationFeedback[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const searchParams = new URLSearchParams(window.location.search);
  const configId = searchParams.get('configId');

  const { data: config } = useQuery<AdminConfig>({
    queryKey: [`/api/chat-configs/${configId}`],
    enabled: !!configId,
  });

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

        // For upload type, use existing feedback
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
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-blue-900">
            {config?.type === 'upload' ? 'Upload Analysis' : 'Conversation Analysis'}
          </h1>
        </div>

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
                  <CardHeader>
                    <h2 className="text-lg font-semibold">
                      {conversation.userName ? 
                        `${conversation.userName}'s ${config?.type === 'upload' ? 'Upload' : 'Conversation'}` : 
                        `Anonymous ${config?.type === 'upload' ? 'Upload' : 'Conversation'} ${index + 1}`}
                    </h2>
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
  );
}