import { useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Message } from "@/lib/types";

interface ConversationFeedback {
  bullets: string[];
  score: number | null;
  summary: string | null;
}

export default function ConversationAnalysis() {
  const [chatUrl, setChatUrl] = useState("");
  const [conversations, setConversations] = useState<{ sessionId: string; messages: Message[]; createdAt: string }[]>([]);
  const [feedbacks, setFeedbacks] = useState<ConversationFeedback[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleAnalyze = async () => {
    try {
      // Validate and extract URL parameters
      let url;
      try {
        url = new URL(chatUrl);
      } catch (error) {
        throw new Error("Invalid URL format");
      }

      const configId = url.searchParams.get("configId");
      const sessionId = url.searchParams.get("sessionId");
      
      if (!configId) {
        throw new Error("Invalid chat URL - missing configId");
      }

      if (!sessionId) {
        throw new Error("Invalid chat URL - missing sessionId");
      }

      console.log("Analyzing conversation with:", { configId, sessionId, url: chatUrl });

      setIsLoading(true);
      console.log('Starting analysis with URL:', chatUrl);
      console.log('Extracted params:', { configId, sessionId });

      // Fetch config to get feedback criteria
      console.log('Fetching chat configuration...');
      const configResponse = await fetch(`/api/chat-configs/${configId}`);
      if (!configResponse.ok) {
        const errorText = await configResponse.text();
        console.error('Failed to fetch config:', errorText);
        throw new Error(`Failed to fetch chat configuration: ${errorText}`);
      }
      const config = await configResponse.json();
      console.log('Received config:', config);

      if (!config.feedbackCriteria) {
        console.error('No feedback criteria found in config');
        throw new Error("This chat configuration has no feedback criteria set");
      }

      // Fetch conversations
      const conversationsUrl = `/api/conversations/${configId}${sessionId ? `?sessionId=${sessionId}` : ''}`;
      console.log('Fetching conversations from:', conversationsUrl);
      const conversationsResponse = await fetch(conversationsUrl);
      if (!conversationsResponse.ok) {
        const errorText = await conversationsResponse.text();
        console.error('Failed to fetch conversations:', errorText);
        throw new Error(`Failed to fetch conversations: ${errorText}`);
      }
      const conversationsData = await conversationsResponse.json();
      console.log('Received conversations data:', conversationsData);
      
      if (!Array.isArray(conversationsData) || conversationsData.length === 0) {
        console.error('No conversations found in response');
        throw new Error("No conversations found for this chat configuration");
      }

      setConversations(conversationsData);
      console.log('Set conversations state with:', conversationsData.length, 'conversations');

      // Get feedback for each conversation
      const feedbackPromises = conversationsData.map(async (conversation) => {
        console.log('Processing conversation:', conversation);
        
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
          throw new Error(`Failed to get feedback: ${errorText}`);
        }

        const feedback = await feedbackResponse.json();
        console.log('Received feedback:', feedback);
        return feedback;
      });

      const allFeedback = await Promise.all(feedbackPromises);
      console.log('All feedback:', allFeedback);
      setFeedbacks(allFeedback);
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-blue-900 mb-6">Conversation Analysis</h1>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <Input
                value={chatUrl}
                onChange={(e) => setChatUrl(e.target.value)}
                placeholder="Paste chat URL here..."
                className="flex-1"
              />
              <Button onClick={handleAnalyze} disabled={!chatUrl || isLoading}>
                Generate Feedback
              </Button>
            </div>
          </CardContent>
        </Card>

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
                <Card key={conversation.sessionId}>
                  <CardHeader>
                    <h2 className="text-lg font-semibold">
                      Conversation from {new Date(conversation.createdAt).toLocaleString()}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Session ID: {conversation.sessionId}
                    </p>
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
