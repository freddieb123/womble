import { useState, useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import MessageBubble from "./MessageBubble";
import type { Message, ChatState, AdminConfig } from "@/lib/types";

interface Props {
  config: AdminConfig;
}

export default function ChatInterface({ config }: Props) {
  const [input, setInput] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackData, setFeedbackData] = useState<{ bullets: string[], score: number | null, summary: string | null }>({ bullets: [], score: null, summary: null });
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const searchParams = new URLSearchParams(window.location.search);
  const configId = searchParams.get('configId');
  const [sessionId] = useState(() => crypto.randomUUID()); // Generate unique session ID
  
  const { data: chatState = { messages: [], isLoading: false, error: null } } = useQuery<ChatState>({
    queryKey: [`/api/messages?configId=${configId}&sessionId=${sessionId}`],
    enabled: !!configId,
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const url = new URL("/api/messages", window.location.origin);
      const searchParams = new URLSearchParams(window.location.search);
      const configId = searchParams.get('configId');
      url.searchParams.set('configId', configId || '');
      
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
      
      queryClient.setQueryData<ChatState>(["/api/messages"], (old) => ({
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
              queryClient.setQueryData<ChatState>(["/api/messages"], (old) => ({
                messages: [
                  ...(old?.messages || []).filter(m => m.id !== assistantMessage.id),
                  { ...assistantMessage }
                ],
                isLoading: false,
                error: null
              }));
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
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatState.messages]);

  return (
    <div className="flex flex-col h-[600px]">
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

      <div className="p-4 border-t">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1"
            disabled={sendMessage.isPending}
          />
          <Button 
            type="submit" 
            disabled={sendMessage.isPending || !input.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>

      <div className="px-4 pb-4">
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

            try {
              const url = new URL("/api/chat-feedback", window.location.origin);
              const searchParams = new URLSearchParams(window.location.search);
              const configId = searchParams.get('configId');
              url.searchParams.set('configId', configId || '');

              const response = await fetch(url.toString(), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ feedbackCriteria: config.feedbackCriteria }),
              });

              if (!response.ok) {
                throw new Error(await response.text());
              }

              const { bullets, score, summary, rawFeedback } = await response.json();
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
          className="w-full"
          disabled={chatState.messages.length === 0}
        >
          Get Feedback
        </Button>
      </div>

      <Dialog open={feedbackOpen}>
        <DialogContent className="sm:max-w-md [&_[data-dialog-close]]:hidden">
          <DialogHeader>
            <DialogTitle className="flex justify-between items-center">
              <span>Chat Feedback</span>
              <Button variant="ghost" size="icon" onClick={() => setFeedbackOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
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