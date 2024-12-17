import { useState, useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MessageBubble from "./MessageBubble";
import type { Message, ChatState, AdminConfig } from "@/lib/types";

interface Props {
  config: AdminConfig;
}

export default function ChatInterface({ config }: Props) {
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceOnlyMode, setVoiceOnlyMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const speechQueue = useRef<string[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const speak = (text: string) => {
    if (!voiceEnabled) return;
    
    // Clean up text: replace punctuation with pauses and remove explicit punctuation words
    const cleanText = text
      .replace(/([.!?])\s+/g, '$1\n') // Add pauses after punctuation
      .replace(/\sexclamation mark\s/gi, '!') // Replace spoken punctuation with symbols
      .replace(/\speriod\s/gi, '.') 
      .replace(/\squestion mark\s/gi, '?')
      .replace(/\scomma\s/gi, ',');
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      // Process next item in queue if any
      const nextText = speechQueue.current.shift();
      if (nextText) speak(nextText);
    };
    
    // Optimize speech settings based on mode
    if (voiceOnlyMode) {
      utterance.rate = 1.1; // Slightly faster for natural conversation
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
    } else {
      utterance.rate = 1.0; // Normal rate for text mode
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
    }
    
    // If currently speaking, queue the text
    // Otherwise speak immediately
    if (window.speechSynthesis.speaking) {
      // Queue longer phrases, ignore very short responses
      if (cleanText.length > 2) {
        speechQueue.current.push(cleanText);
      }
    } else {
      window.speechSynthesis.speak(utterance);
    }
  };

  // Stop speaking when component unmounts
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    // Initialize speech recognition
    if (window.SpeechRecognition || window.webkitSpeechRecognition) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event) => {
        if (voiceOnlyMode) {
          const lastResult = event.results[event.results.length - 1];
          const transcript = lastResult[0].transcript;
          
          if (lastResult.isFinal) {
            // Only send if the transcript is meaningful (not just noise)
            if (transcript.trim().length > 2) {
              sendMessage.mutate(transcript.trim());
            }
          }
        } else {
          const transcript = Array.from(event.results)
            .map(result => result[0].transcript)
            .join('');
          setInput(transcript);
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to record audio. Please check your microphone permissions.",
        });
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [toast]);

  const { data: chatState = { messages: [], isLoading: false, error: null } } = useQuery<ChatState>({
    queryKey: ["/api/messages"],
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const queryParams = voiceOnlyMode ? '?mode=voice' : '';
      const response = await fetch(`/api/messages${queryParams}`, {
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
              
              // For voice mode, handle speech synthesis differently
              if (voiceOnlyMode) {
                // In voice mode, speak each chunk immediately for faster responses
                speak(parsed.content);
              } else {
                // For text mode, wait for complete phrases
                if (parsed.content.match(/[.!?,;]\s*$/) || parsed.content.length > 10) {
                  speak(parsed.content);
                }
              }
              
              // Update UI immediately without waiting for speech
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

      <div className="p-4 border-t flex gap-2">
        {!voiceOnlyMode ? (
          <form onSubmit={handleSubmit} className="flex gap-2 flex-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setVoiceEnabled(!voiceEnabled);
                if (voiceEnabled) {
                  window.speechSynthesis.cancel();
                  setIsSpeaking(false);
                  speechQueue.current = [];
                }
              }}
              className={voiceEnabled ? "bg-blue-50" : ""}
            >
              {voiceEnabled ? (
                <Volume2 className="h-4 w-4 text-blue-500" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </Button>
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
        ) : (
          <div className="flex-1 flex justify-center items-center">
            <p className="text-sm text-muted-foreground">
              {isRecording ? "Listening..." : "Click microphone to start speaking"}
            </p>
          </div>
        )}
        
        <Button
          type="button"
          variant={voiceOnlyMode ? "default" : "outline"}
          className={`${isRecording ? "bg-red-50" : ""} ${voiceOnlyMode ? "bg-blue-500 hover:bg-blue-600" : ""}`}
          onClick={() => {
            if (!recognitionRef.current) {
              toast({
                variant: "destructive",
                title: "Error",
                description: "Speech recognition is not supported in your browser.",
              });
              return;
            }

            if (isRecording) {
              recognitionRef.current.stop();
              setIsRecording(false);
            } else {
              recognitionRef.current.start();
              setIsRecording(true);
              setInput("");
            }
            
            if (!voiceOnlyMode) {
              setVoiceOnlyMode(true);
              setVoiceEnabled(true);
            }
          }}
        >
          {isRecording ? (
            <MicOff className="h-4 w-4 text-red-500" />
          ) : (
            <Mic className={`h-4 w-4 ${voiceOnlyMode ? "text-white" : ""}`} />
          )}
        </Button>
        
        {voiceOnlyMode && !isRecording && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setVoiceOnlyMode(false);
              setIsRecording(false);
              if (recognitionRef.current) {
                recognitionRef.current.stop();
              }
            }}
          >
            Exit Voice Mode
          </Button>
        )}
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
