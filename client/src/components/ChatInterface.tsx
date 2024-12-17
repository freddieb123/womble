import { useState, useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MessageBubble from "./MessageBubble";
import type { Message, ChatState, AdminConfig } from "@/lib/types";

interface Props {
  config: AdminConfig;
}

export default function ChatInterface({ config }: Props) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: chatState = { messages: [], isLoading: false, error: null } } = useQuery<ChatState>({
    queryKey: ["/api/messages"],
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, config }),
      });
      
      if (!response.ok) {
        throw new Error(await response.text());
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
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

      <form onSubmit={handleSubmit} className="p-4 border-t flex gap-2">
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
              const response = await fetch("/api/chat-feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ feedbackCriteria: config.feedbackCriteria }),
              });

              if (!response.ok) {
                throw new Error(await response.text());
              }

              const { feedback } = await response.json();
              toast({
                title: "Chat Feedback",
                description: feedback,
                duration: 10000,
              });
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
    </div>
  );
}
