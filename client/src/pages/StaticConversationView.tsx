import { useEffect, useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Message, AdminConfig } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import WombleHeader from "@/components/WombleHeader";
import WombleFooter from "@/components/WombleFooter";

interface ConversationData {
  messages: Message[];
  userName: string | null;
}

export default function StaticConversationView() {
  const [conversation, setConversation] = useState<ConversationData | null>(null);
  const { toast } = useToast();

  const searchParams = new URLSearchParams(window.location.search);
  const configId = searchParams.get('configId');
  const sessionId = searchParams.get('sessionId');

  const { data: config } = useQuery<AdminConfig>({
    queryKey: [`/api/chat-configs/${configId}`],
    enabled: !!configId,
  });

  useEffect(() => {
    const fetchConversation = async () => {
      if (!configId || !sessionId) return;

      try {
        const response = await fetch(`/api/messages?configId=${configId}&sessionId=${sessionId}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch conversation: ${await response.text()}`);
        }
        const data = await response.json();
        setConversation({
          messages: data.messages,
          userName: null
        });
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to fetch conversation",
        });
      }
    };

    fetchConversation();
  }, [configId, sessionId, toast]);

  if (!configId || !sessionId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-red-600">Missing required parameters</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <WombleHeader />
      <div className="flex-1 bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardHeader>
              <h1 className="text-2xl font-bold text-blue-900">
                {config?.title || 'Chat with an Agent'}
              </h1>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[calc(100vh-16rem)]">
                <div className="space-y-4">
                  {conversation?.messages.map((message, index) => (
                    <div
                      key={message.id || index}
                      className={`flex flex-col ${
                        message.role === 'assistant' ? 'items-start' : 'items-end'
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-4 ${
                          message.role === 'assistant'
                            ? 'bg-blue-100 text-blue-900'
                            : 'bg-green-100 text-green-900'
                        }`}
                      >
                        {typeof message.content === 'string' ? (
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        ) : (
                          <>
                            {message.content.text && (
                              <p className="whitespace-pre-wrap">{message.content.text}</p>
                            )}
                            {message.content.image && (
                              <img
                                src={message.content.image}
                                alt="Uploaded content"
                                className="mt-2 max-w-full rounded"
                              />
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
      <WombleFooter />
    </div>
  );
}
