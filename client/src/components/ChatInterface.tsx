import { useState, useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, X, Lightbulb } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import MessageBubble from "./MessageBubble";
import UserNameModal from "./UserNameModal";
import type { Message, ChatState, AdminConfig } from "@/lib/types";

interface Props {
  config: AdminConfig;
}

export default function ChatInterface({ config }: Props) {
  const [input, setInput] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [feedbackData, setFeedbackData] = useState<{ bullets: string[], score: number | null, summary: string | null }>({ bullets: [], score: null, summary: null });
  const [isGettingHint, setIsGettingHint] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const searchParams = new URLSearchParams(window.location.search);
  const configId = searchParams.get('configId');
  const [sessionId] = useState(() => crypto.randomUUID());
  const [showNameModal, setShowNameModal] = useState(true);
  const [userName, setUserName] = useState<string | null>(null);

  const { data: chatState = { messages: [], isLoading: false, error: null } } = useQuery<ChatState>({
    queryKey: [`/api/messages?configId=${configId}&sessionId=${sessionId}`],
    enabled: !!configId,
  });

  const hasEnoughMessages = chatState.messages.length >= 5;

  const getHint = async () => {
    if (!config.feedbackCriteria) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No feedback criteria specified for this chat."
      });
      return;
    }

    try {
      setIsGettingHint(true);
      const response = await fetch("/api/chat-hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackCriteria: config.feedbackCriteria,
          userInstructions: config.userInstructions,
          messages: chatState.messages
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const hint = await response.json();
      toast({
        title: "Hint",
        description: hint.message,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get hint",
      });
    } finally {
      setIsGettingHint(false);
    }
  };

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const url = new URL("/api/messages", window.location.origin);
      const searchParams = new URLSearchParams(window.location.search);
      const configId = searchParams.get('configId');
      url.searchParams.set('configId', configId || '');
      url.searchParams.set('sessionId', sessionId);
      if (userName) {
        url.searchParams.set('userName', userName);
      }

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, config }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      // Add the user message immediately
      const userMessage: Message = {
        id: crypto.randomUUID(),
        content,
        role: 'user',
        timestamp: Date.now()
      };

      queryClient.setQueryData<ChatState>([`/api/messages?configId=${configId}&sessionId=${sessionId}`], (old) => ({
        messages: [...(old?.messages || []), userMessage],
        isLoading: false,
        error: null
      }));

      let assistantMessage: Message = {
        id: '',
        content: '',
        role: 'assistant',
        timestamp: Date.now()
      };

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("Failed to read response");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(5);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.error) throw new Error(parsed.error);

              if (!assistantMessage.id) {
                assistantMessage.id = parsed.messageId;
              }

              assistantMessage.content += parsed.content;

              // Update UI immediately
              queryClient.setQueryData<ChatState>([`/api/messages?configId=${configId}&sessionId=${sessionId}`], (old) => {
                const existingMessages = old?.messages || [];
                const updatedMessages = existingMessages.filter(m => m.id !== assistantMessage.id);
                return {
                  messages: [...updatedMessages, { ...assistantMessage }],
                  isLoading: false,
                  error: null
                };
              });
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }

      return { success: true };
    },
    onSuccess: () => {
      setInput("");
      inputRef.current?.focus();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage.mutate(input.trim());
    }
  };

  useEffect(() => {
    const scrollToBottom = () => {
      if (scrollRef.current) {
        const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
          viewport.scrollTop = viewport.scrollHeight;
        }
      }
    };
    

    scrollToBottom();
    

    // Handle both scrolling and focus after messages change
    const timeout = setTimeout(() => {
      scrollToBottom();
      if (!showNameModal && inputRef.current) {
        inputRef.current.focus();
      }
    }, 100);
    

    return () => clearTimeout(timeout);
  }, [chatState.messages, showNameModal]);

  const isViewOnly = searchParams.get('viewOnly') === 'true';

  return (
    <div className="flex flex-col h-[600px]">
      {isViewOnly && userName && (
        <div className="p-4 border-b bg-blue-50">
          <h2 className="text-lg font-semibold text-blue-900">
            {userName}'s Chat History
          </h2>
        </div>
      )}
      <UserNameModal 
        open={showNameModal} 
        onSubmit={(name) => {
          setUserName(name);
          setShowNameModal(false);
          setTimeout(() => inputRef.current?.focus(), 0);
        }} 
      />
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {chatState.messages.map((message: Message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {sendMessage.isPending && (
            <div className="flex justify-start">
              <div className="bg-blue-100 text-blue-900 rounded-lg p-3 max-w-[80%] animate-pulse">
                Thinking...
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {!isViewOnly && (
        <>
          <div className="p-4 border-t">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                className="flex-1"
                disabled={sendMessage.isPending || showNameModal}
                ref={inputRef}
              />
              <Button 
                type="submit" 
                disabled={sendMessage.isPending || !input.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
          <div className="px-4 pb-4 space-y-2">
            <div className="flex gap-2">
              <Button
                onClick={getHint}
                variant="outline"
                className="flex-1"
                disabled={isGettingHint}
              >
                <Lightbulb className="h-4 w-4 mr-2" />
                {isGettingHint ? 'Getting hint...' : 'Get Hint'}
              </Button>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex-1">
                      <Button
                        onClick={async () => {
                          // Existing feedback logic
                          if (!config.feedbackCriteria) {
                            toast({
                              variant: "destructive",
                              title: "Error",
                              description: "No feedback criteria specified for this chat configuration.",
                            });
                            return;
                          }

                          if (chatState.messages.length === 0) {
                            toast({
                              variant: "destructive",
                              title: "No Messages",
                              description: "Please have a conversation first before requesting feedback.",
                            });
                            return;
                          }

                          const hasUserMessage = chatState.messages.some(m => m.role === 'user');
                          const hasAssistantMessage = chatState.messages.some(m => m.role === 'assistant');
                          if (!hasUserMessage || !hasAssistantMessage) {
                            toast({
                              variant: "destructive",
                              title: "Incomplete Conversation",
                              description: "Please complete at least one exchange before requesting feedback.",
                            });
                            return;
                          }

                          try {
                            const response = await fetch("/api/chat-feedback", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ 
                                feedbackCriteria: config.feedbackCriteria,
                                messages: chatState.messages 
                              }),
                            });

                            if (!response.ok) {
                              throw new Error(await response.text());
                            }

                            const { bullets, score, summary } = await response.json();
                            setFeedbackData({ bullets, score, summary });
                            setFeedbackOpen(true);
                          } catch (error) {
                            toast({
                              variant: "destructive",
                              title: "Error",
                              description: error instanceof Error ? error.message : "Failed to get feedback",
                            });
                          }
                        }}
                        variant="outline"
                        disabled={!hasEnoughMessages}
                        className="w-full"
                      >
                        Get Feedback
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {hasEnoughMessages 
                        ? "Get feedback on your conversation" 
                        : "Have a longer conversation (at least 5 messages) to get meaningful feedback"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </>
      )}

      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Chat Feedback</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-3">
              {feedbackData.bullets.map((bullet, index) => (
                <div key={index} className="flex items-start gap-2 text-sm">
                  <span>•</span>
                  <span>{bullet}</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-4">
              <div className="flex flex-col gap-2">
                <span className="text-2xl font-bold">{feedbackData.score}/10</span>
                {feedbackData.summary && (
                  <p className="text-sm text-muted-foreground">{feedbackData.summary}</p>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}