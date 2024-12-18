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
  const [conversations, setConversations] = useState<{ sessionId: string; messages: Message[]; createdAt: string; feedback?: string }[]>([]);
  const [feedbacks, setFeedbacks] = useState<Record<string, ConversationFeedback>>({});
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleAnalyze = async () => {
    setIsLoading(true);
    try {
      // Validate and extract URL parameters
      let url;
      try {
        url = new URL(chatUrl);
      } catch (error) {
        throw new Error("Invalid URL format");
      }

      // Extract configId and linkId from URL path or search params
      let configId, linkId;
      
      // Try to get configId from path first (e.g., /chat/13?linkId=abc123)
      const pathMatch = url.pathname.match(/\/chat\/(\d+)/);
      if (pathMatch) {
        configId = pathMatch[1];
      } else {
        // Fallback to search params
        configId = url.searchParams.get("configId");
      }
      
      // Look for linkId in search params
      linkId = url.searchParams.get("linkId");
      
      console.log('Extracted URL parameters:', { configId, linkId, pathname: url.pathname, searchParams: Object.fromEntries(url.searchParams) });
      
      if (!configId) {
        throw new Error("Invalid chat URL - missing configId");
      }

      if (!linkId) {
        throw new Error("Invalid chat URL - missing linkId");
      }

      console.log("Analyzing conversation with:", { configId, linkId, url: chatUrl });
      console.log('Starting analysis with URL:', chatUrl);
      console.log('Extracted params:', { configId, linkId });

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

      // If we have a linkId, fetch aggregated feedback, otherwise fetch individual conversations
      const endpoint = linkId 
        ? `/api/conversations/${configId}/feedback?linkId=${linkId}`
        : `/api/conversations/${configId}`;
      
      console.log('Fetching from endpoint:', endpoint);
      
      const response = await fetch(endpoint);
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("No conversations found for this link");
        }
        const errorText = await response.text();
        throw new Error(`Failed to fetch data: ${errorText}`);
      }

      const responseData = await response.json();
      console.log('Fetched data:', responseData);
      
      if (!conversationsResponse.ok) {
        // If conversation is not found for the specific session, show error
        if (conversationsResponse.status === 404 && sessionId) {
          throw new Error("No conversation found for this chat link");
        }
        console.error('Failed to fetch conversations:', responseText);
        throw new Error(`Failed to fetch conversations: ${responseText}`);
      }
      
      let conversationsData;
      try {
        conversationsData = JSON.parse(responseText);
        console.log('Parsed conversations data:', conversationsData);
      } catch (error) {
        console.error('Error parsing conversations data:', error);
        throw new Error('Invalid response format from server');
      }
      
      if (!Array.isArray(conversationsData)) {
        throw new Error("Invalid response format: expected an array of conversations");
      }
      
      if (sessionId && conversationsData.length === 0) {
        throw new Error("No conversation found for this chat link");
      }

      if (linkId) {
        // Handle aggregated feedback data
        const { feedbackItems, summary } = responseData;
        
        // Process each feedback item
        const processedItems = feedbackItems.map(item => ({
          sessionId: item.sessionId,
          createdAt: item.createdAt,
          feedback: item.feedback
        }));

        setConversations(processedItems);
        
        // Store feedback data
        const feedbackMap: Record<string, ConversationFeedback> = {};
        feedbackItems.forEach(item => {
          if (item.feedback) {
            feedbackMap[item.sessionId] = {
              bullets: item.feedback.bullets || [],
              score: item.feedback.score || null,
              summary: item.feedback.summary || null
            };
          }
        });
        
        setFeedbacks(feedbackMap);
        
        console.log('Processed aggregated feedback:', {
          items: processedItems.length,
          averageScore: summary.averageScore,
          totalParticipants: summary.totalParticipants
        });
      } else {
        // Handle individual conversation data
        const processedConversations = responseData.map((conversation: any) => {
          let parsedFeedback: ConversationFeedback | undefined;
          
          if (conversation.feedback) {
            try {
              const feedbackData = typeof conversation.feedback === 'string' 
                ? JSON.parse(conversation.feedback)
                : conversation.feedback;
                
              if (feedbackData.bullets || feedbackData.score !== undefined) {
                parsedFeedback = {
                  bullets: feedbackData.bullets || [],
                  score: feedbackData.score || null,
                  summary: feedbackData.summary || null
                };
              }
            } catch (error) {
              console.error('Error parsing feedback:', error);
            }
          }

          // Store parsed feedback
          if (parsedFeedback) {
            setFeedbacks(prev => ({
              ...prev,
              [conversation.sessionId]: parsedFeedback
            }));
          }

          return {
            ...conversation,
            feedback: conversation.feedback
          };
        });

        setConversations(processedConversations);
        console.log('Set conversations state with:', processedConversations.length, 'conversations');
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
            {linkId && responseData?.summary && (
              <Card className="mb-4">
                <CardHeader>
                  <h2 className="text-lg font-semibold">Aggregated Feedback Statistics</h2>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg text-center">
                      <div className="text-sm text-blue-600">Total Participants</div>
                      <div className="text-2xl font-bold text-blue-900">
                        {responseData.summary.totalParticipants}
                      </div>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg text-center">
                      <div className="text-sm text-blue-600">Completed with Feedback</div>
                      <div className="text-2xl font-bold text-blue-900">
                        {responseData.summary.completedWithFeedback}
                      </div>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg text-center">
                      <div className="text-sm text-blue-600">Average Score</div>
                      <div className="text-2xl font-bold text-blue-900">
                        {responseData.summary.averageScore.toFixed(1)}/10
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            <div className="space-y-4">
              {conversations.map((conversation) => (
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
                    {feedbacks[conversation.sessionId] ? (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          {feedbacks[conversation.sessionId].bullets.map((bullet, bulletIndex) => (
                            <div key={bulletIndex} className="flex items-start gap-2 text-sm">
                              <span>•</span>
                              <span>{bullet}</span>
                            </div>
                          ))}
                        </div>
                        <div className="border-t pt-4">
                          <div className="flex flex-col gap-2 bg-blue-50 p-4 rounded-lg">
                            <span className="text-2xl font-bold text-blue-900">
                              {feedbacks[conversation.sessionId].score}/10
                            </span>
                            {feedbacks[conversation.sessionId].summary && (
                              <p className="text-sm text-blue-700">
                                {feedbacks[conversation.sessionId].summary}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        No feedback available for this conversation
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
