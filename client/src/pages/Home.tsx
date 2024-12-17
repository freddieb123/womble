import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import AdminPanel from "@/components/AdminPanel";
import type { AdminConfig } from "@/lib/types";

export default function Home() {
  const [config, setConfig] = useState<AdminConfig>({
    title: "",
    systemPrompt: "You are a helpful AI assistant.",
    temperature: 0.7,
    maxTokens: 1000
  });
  const { toast } = useToast();

  const saveConfig = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/chat-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: config.title,
          systemPrompt: config.systemPrompt,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save configuration");
      }
      
      return response.json();
    },
    onSuccess: (savedConfig) => {
      return savedConfig.id;
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
      throw error;
    },
  });

  const handleCopyLink = async () => {
    try {
      const savedConfig = await saveConfig.mutateAsync();
      if (!savedConfig) {
        throw new Error("Failed to save configuration");
      }
      const params = new URLSearchParams();
      params.set('configId', savedConfig.id.toString());
      const url = `${window.location.origin}/chat?${params.toString()}`;
      
      await navigator.clipboard.writeText(url);
      toast({
        description: "Link copied to clipboard!",
      });
    } catch (error) {
      console.error("Error copying link:", error);
      // Error already handled by mutation
    }
  };

  const handleOpenChat = async () => {
    try {
      const savedConfig = await saveConfig.mutateAsync();
      if (!savedConfig) {
        throw new Error("Failed to save configuration");
      }
      const params = new URLSearchParams();
      params.set('configId', savedConfig.id.toString());
      window.open(`/chat?${params.toString()}`, '_blank');
    } catch (error) {
      console.error("Error opening chat:", error);
      // Error already handled by mutation
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-blue-900">AI Chat Admin</h1>
        </div>

        <Card className="p-6">
          <div className="space-y-6">
            <AdminPanel config={config} onConfigChange={setConfig} />

            <div className="flex gap-2">
              <Button onClick={handleCopyLink} disabled={saveConfig.isPending}>
                <Copy className="h-4 w-4 mr-2" />
                Copy Link
              </Button>
              <Button 
                variant="outline" 
                onClick={handleOpenChat}
                disabled={saveConfig.isPending}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Chat
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
