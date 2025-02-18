import { useState, useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Lightbulb, Info, X, Trophy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import MessageBubble from "./MessageBubble";
import UserNameModal from "./UserNameModal";
import LeaderboardModal from "./LeaderboardModal";
import type { Message, ChatState, AdminConfig, MessageContent } from "@/lib/types";

interface Props {
  config: AdminConfig;
  sessionId: string;
  userName: string | null;
  isViewOnly: boolean;
  onUserNameSubmit: (name: string) => string;
}

interface LeaderboardEntry {
  userName: string;
  score: number;
  total: number;
  isCurrentUser: boolean;
}

export default function ChatInterface({ config, sessionId, userName, isViewOnly, onUserNameSubmit }: Props) {
  const [input, setInput] = useState("");
  const [pastedImage, setPastedImage] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<number>();
  const inputRef = useRef<HTMLInputElement>(null);
  const [feedbackData, setFeedbackData] = useState<{ bullets: string[], score: number | null, summary: string | null }>({ bullets: [], score: null, summary: null });
  const [isGettingHint, setIsGettingHint] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showNameModal, setShowNameModal] = useState(!isViewOnly && !userName);

  const { data: chatState = { messages: [], isLoading: false, error: null } } = useQuery<ChatState>({
    queryKey: [`/api/messages?configId=${config.id}&sessionId=${sessionId}`],
    enabled: !!config.id && !!sessionId,
  });

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch(`/api/conversations/${config.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch leaderboard data');
      }

      const data = await response.json();

      const scoredEntries = data
        .filter((entry: any) => entry.feedback && entry.feedback.score !== null)
        .map((entry: any) => ({
          userName: entry.userName || 'Anonymous',
          score: entry.feedback.score,
          total: 10, // Feedback scores are out of 10
          isCurrentUser: entry.userName === userName && entry.sessionId === sessionId
        }));

      const sortedEntries = scoredEntries.sort((a: LeaderboardEntry, b: LeaderboardEntry) => 
        b.score - a.score
      );

      const userRankIndex = sortedEntries.findIndex(entry => entry.isCurrentUser);
      if (userRankIndex !== -1) {
        setUserRank(userRankIndex + 1);
      }

      setLeaderboardData(sortedEntries);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load leaderboard data",
      });
    }
  };

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!e.clipboardData) return;

      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (!blob) continue;

          const reader = new FileReader();
          reader.onload = (event) => {
            const base64String = event.target?.result as string;
            setPastedImage(base64String);
          };
          reader.readAsDataURL(blob);
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const url = new URL("/api/messages", window.location.origin);
      url.searchParams.set('configId', config.id?.toString() || '');
      url.searchParams.set('sessionId', sessionId);
      if (userName) {
        url.searchParams.set('userName', userName);
      }

      const messageContent: MessageContent = {
        text: content,
        image: pastedImage
      };

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: messageContent, config }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const userMessage: Message = {
        id: crypto.randomUUID(),
        content: messageContent,
        role: 'user',
        timestamp: Date.now(),
        sessionId
      };

      queryClient.setQueryData<ChatState>([`/api/messages?configId=${config.id}&sessionId=${sessionId}`], (old) => ({
        messages: [...(old?.messages || []), userMessage],
        isLoading: false,
        error: null
      }));

      let assistantMessage: Message = {
        id: '',
        content: '',
        role: 'assistant',
        timestamp: Date.now(),
        sessionId
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

              queryClient.setQueryData<ChatState>([`/api/messages?configId=${config.id}&sessionId=${sessionId}`], (old) => {
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
      setPastedImage(null);
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
    if (input.trim() || pastedImage) {
      sendMessage.mutate(input.trim());
    } else {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please provide either a message or an image",
      });
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

    const timeout = setTimeout(() => {
      scrollToBottom();
      if (!showNameModal && inputRef.current) {
        inputRef.current.focus();
      }
    }, 100);

    return () => clearTimeout(timeout);
  }, [chatState.messages, showNameModal]);

  return (
    <div className="flex flex-col h-[600px]">
      {config.userInstructions && !isViewOnly && (
        <Alert className="mb-4">
          <Info className="h-4 w-4" />
          <AlertDescription>
            <div className="font-semibold text-lg mb-2">{config.title}</div>
            <pre className="font-sans whitespace-pre-wrap">{config.userInstructions}</pre>
          </AlertDescription>
        </Alert>
      )}
      {isViewOnly && userName && (
        <div className="p-4 border-b bg-blue-50">
          <h2 className="text-lg font-semibold text-blue-900">
            {userName}'s Chat History
          </h2>
        </div>
      )}
      {showNameModal && (
        <UserNameModal
          open={showNameModal}
          onSubmit={(name) => {
            const newUrl = onUserNameSubmit(name);
            setShowNameModal(false);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
        />
      )}
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
          {pastedImage && (
            <div className="px-4 pb-2">
              <div className="relative inline-block">
                <img
                  src={pastedImage}
                  alt="Pasted screenshot"
                  className="max-h-32 rounded-lg border border-gray-200"
                />
                <button
                  onClick={() => setPastedImage(null)}
                  className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-sm border border-gray-200"
                >
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>
            </div>
          )}
          <div className="p-4 border-t">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={pastedImage ? "Add a message (optional) and press send..." : "Type your message or paste an image..."}
                className="flex-1"
                disabled={sendMessage.isPending || showNameModal}
                ref={inputRef}
              />
              <Button
                type="submit"
                disabled={sendMessage.isPending || !input.trim() && !pastedImage}
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
                                configId: config.id,
                                sessionId,
                                messages: chatState.messages,
                                type: config.type
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
              <div className="flex flex-col gap-4">
                <span className="text-2xl font-bold">{feedbackData.score}/10</span>
                {feedbackData.summary && (
                  <p className="text-sm text-muted-foreground">{feedbackData.summary}</p>
                )}
                <Button
                  onClick={() => {
                    fetchLeaderboard();
                    setShowLeaderboard(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Trophy className="w-4 h-4 mr-2" />
                  View Leaderboard
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <LeaderboardModal
        open={showLeaderboard}
        onOpenChange={setShowLeaderboard}
        entries={leaderboardData}
        currentUserRank={userRank}
        title="Conversation Leaderboard"
        maxScore={10}
      />
    </div>
  );
}