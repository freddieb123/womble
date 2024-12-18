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
  const [conversations, setConversations] = useState<Message[][]>([]);
  const [feedbacks, setFeedbacks] = useState<ConversationFeedback[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleAnalyze = async () => {
    try {
      // Extract configId from URL
      const url = new URL(chatUrl);
      const configId = url.searchParams.get("configId");
      
      if (!configId) {
        throw new Error("Invalid chat URL");
      }

      setIsLoading(true);

      // Fetch config to get feedback criteria
      const configResponse = await fetch(`/api/chat-configs/${configId}`);
      if (!configResponse.ok) {
        throw new Error("Failed to fetch chat configuration");
      }
      const config = await configResponse.json();

      // Fetch conversations
      const conversationsResponse = await fetch(`/api/conversations/${configId}`);
      if (!conversationsResponse.ok) {
        throw new Error("Failed to fetch conversations");
      }
      const conversationsData = await conversationsResponse.json();
      setConversations(conversationsData);

      // Get feedback for each conversation
      const feedbackPromises = conversationsData.map(async (conversation: Message[]) => {
        const feedbackResponse = await fetch("/api/chat-feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            feedbackCriteria: config.feedbackCriteria,
            messages: conversation
          }),
        });

        if (!feedbackResponse.ok) {
          throw new Error("Failed to get feedback");
        }

        return feedbackResponse.json();
      });

      const allFeedback = await Promise.all(feedbackPromises);
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
                <Card key={index}>
                  <CardHeader>
                    <h2 className="text-lg font-semibold">
                      Conversation {index + 1}
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
                          <div className="flex flex-col gap-2">
                            <span className="text-2xl font-bold">
                              {feedbacks[index].score}/10
                            </span>
                            {feedbacks[index].summary && (
                              <p className="text-sm text-muted-foreground">
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
