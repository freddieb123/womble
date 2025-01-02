import { useState, useEffect } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import type { Message } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";

interface ConversationFeedback {
  bullets: string[];
  score: number | null;
  summary: string | null;
}

interface ConversationData {
  messages: Message[];
  userName: string | null;
  sessionId: string; // Added sessionId
}

export default function ConversationAnalysis() {
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [feedbacks, setFeedbacks] = useState<ConversationFeedback[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const { toast } = useToast();

  // Get configId from URL
  const searchParams = new URLSearchParams(window.location.search);
  const configId = searchParams.get('configId');

  // Fetch config data
  const { data: config } = useQuery({
    queryKey: [`/api/chat-configs/${configId}`],
    enabled: !!configId,
  });

  const regenerateAllFeedback = async () => {
    if (!config?.feedbackCriteria || conversations.length === 0) return;

    try {
      setIsRegenerating(true);

      const newFeedbacks = await Promise.all(
        conversations.map(async (conversation) => {
          const hasUserMessage = conversation.messages.some(m => m.role === 'user');
          const hasAssistantMessage = conversation.messages.some(m => m.role === 'assistant');

          if (!hasUserMessage || !hasAssistantMessage) {
            console.warn('Skipping conversation without complete exchange');
            return null;
          }

          const feedbackResponse = await fetch("/api/chat-feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              feedbackCriteria: config.feedbackCriteria,
              messages: conversation.messages
            }),
          });

          if (!feedbackResponse.ok) {
            const errorText = await feedbackResponse.text();
            throw new Error(`Failed to get feedback: ${errorText}`);
          }

          return feedbackResponse.json();
        })
      );

      const validFeedbacks = newFeedbacks.filter(feedback => feedback !== null);
      setFeedbacks(validFeedbacks);

      toast({
        title: "Feedback Updated",
        description: "Successfully regenerated feedback for all conversations.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to regenerate feedback",
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  useEffect(() => {
    const fetchAndAnalyze = async () => {
      if (!configId || !config?.feedbackCriteria) return;

      try {
        setIsLoading(true);

        // Fetch conversations
        const conversationsResponse = await fetch(`/api/conversations/${configId}`);
        if (!conversationsResponse.ok) {
          throw new Error(`Failed to fetch conversations: ${await conversationsResponse.text()}`);
        }
        const conversationsData = await conversationsResponse.json();

        if (!Array.isArray(conversationsData) || conversationsData.length === 0) {
          throw new Error("No conversations found for this chat GPT");
        }

        setConversations(conversationsData);

        // Get feedback for each conversation
        const feedbackPromises = conversationsData.map(async (conversation: ConversationData) => {
          const hasUserMessage = conversation.messages.some(m => m.role === 'user');
          const hasAssistantMessage = conversation.messages.some(m => m.role === 'assistant');

          if (!hasUserMessage || !hasAssistantMessage) {
            console.warn('Skipping conversation without complete exchange');
            return null;
          }

          const feedbackResponse = await fetch("/api/chat-feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              feedbackCriteria: config.feedbackCriteria,
              messages: conversation.messages
            }),
          });

          if (!feedbackResponse.ok) {
            const errorText = await feedbackResponse.text();
            console.error('Feedback error:', errorText);
            if (errorText.includes('Please have at least one complete exchange')) {
              return null;
            }
            throw new Error(`Failed to get feedback: ${errorText}`);
          }

          return feedbackResponse.json();
        });

        const allFeedback = await Promise.all(feedbackPromises);
        const validFeedback = allFeedback.filter(feedback => feedback !== null);

        if (validFeedback.length === 0) {
          throw new Error("No valid conversations found to analyze. Each conversation must have at least one user message and one assistant response.");
        }

        setFeedbacks(validFeedback);
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
              <div className="text-center text-red-600">No GPT ID provided</div>
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
          <h1 className="text-2xl font-bold text-blue-900">Conversation Analysis</h1>
          <Button
            variant="outline"
            onClick={regenerateAllFeedback}
            disabled={isRegenerating || conversations.length === 0}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
            {isRegenerating ? 'Regenerating...' : 'Regenerate All Feedback'}
          </Button>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              <div className="animate-pulse text-center">Analyzing conversations...</div>
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="h-[calc(100vh-16rem)]">
            <div className="space-y-4">
              {conversations.map((conversation, index) => (
                <Card key={index}>
                  <CardHeader>
                    <h2 className="text-lg font-semibold">
                      <div className="flex justify-between items-center">
                        <span>
                          {conversation.userName 
                            ? `${conversation.userName}'s Conversation` 
                            : `Conversation ${index + 1}`}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`/chat?configId=${configId}&sessionId=${conversation.sessionId}&viewOnly=true`, '_blank')}
                        >
                          <span className="text-sm">View Chat</span>
                        </Button>
                      </div>
                    </h2>
                  </CardHeader>
                  <CardContent>
                    {feedbacks[index] && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          {feedbacks[index].bullets.map((bullet, bulletIndex) => (
                            <div key={bulletIndex} className="flex items-start gap-2 text-sm">
                              <span>•</span>
                              <span>{bullet}</span>
                            </div>
                          ))}
                        </div>
                        <div className="border-t pt-4">
                          <div className="flex flex-col gap-2 bg-blue-50 p-4 rounded-lg">
                            <span className="text-2xl font-bold text-blue-900">
                              {feedbacks[index].score}/10
                            </span>
                            {feedbacks[index].summary && (
                              <p className="text-sm text-blue-700">
                                {feedbacks[index].summary}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
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