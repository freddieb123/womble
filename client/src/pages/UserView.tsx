import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import ChatInterface from "@/components/ChatInterface";
import { AdminConfig } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";

export default function UserView() {
  const [location] = useLocation();
  const params = new URLSearchParams(location.split('?')[1] || '');
  const configId = params.get('configId');

  const { data: savedConfig, isLoading, error } = useQuery({
    queryKey: [`/api/chat-configs/${configId}`],
    enabled: !!configId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="p-6">
            <div className="flex items-center justify-center h-[600px]">
              <div className="animate-pulse text-blue-900">Loading configuration...</div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (error || !savedConfig) {
    const config: AdminConfig = {
      title: "Default Configuration",
      systemPrompt: "You are a helpful AI assistant.",
      temperature: 0.7,
      maxTokens: 1000
    };

    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="p-6">
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              <p className="text-sm text-yellow-700">Using default configuration: {error?.message}</p>
            </div>
            <ChatInterface config={config} />
          </Card>
        </div>
      </div>
    );
  }

  const config: AdminConfig = {
    title: savedConfig.title,
    systemPrompt: savedConfig.systemPrompt,
    temperature: 0.7,
    maxTokens: 1000
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Card className="p-6">
          <ChatInterface config={config} />
        </Card>
      </div>
    </div>
  );
}
