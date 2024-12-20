import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import ChatInterface from "@/components/ChatInterface";
import { AdminConfig } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { SelectChatConfig } from "@db/schema";

export default function UserView() {
  const [location] = useLocation();
  // Parse the query string directly
  const searchParams = new URLSearchParams(window.location.search);
  const configId = searchParams.get('configId');
  
  console.log("Current location:", location);
  console.log("Search params:", window.location.search);
  console.log("Loading config with ID:", configId);

  const { data: savedConfig, isLoading, error } = useQuery<SelectChatConfig>({
    queryKey: [`/api/chat-configs/${configId}`],
    enabled: !!configId,
    retry: 1,
    staleTime: Infinity,
  });

  if (!configId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="p-6">
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <p className="text-sm text-red-700">No GPT ID provided</p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="p-6">
            <div className="flex items-center justify-center h-[600px]">
              <div className="animate-pulse text-blue-900">Loading GPT...</div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (error || !savedConfig) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="p-6">
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <p className="text-sm text-red-700">
                Failed to load GPT: {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const config: AdminConfig = {
    title: savedConfig.title,
    systemPrompt: savedConfig.systemPrompt,
    temperature: 0.7,
    maxTokens: 1000,
    userInstructions: savedConfig.userInstructions || "",
    feedbackCriteria: savedConfig.feedbackCriteria || ""
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Card className="p-6">
          <h1 className="text-2xl font-bold text-blue-900 mb-4">{config.title}</h1>
          {config.userInstructions && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <h2 className="text-sm font-semibold text-blue-900 mb-2">Instructions</h2>
              <p className="text-sm text-blue-800">{config.userInstructions}</p>
            </div>
          )}
          <ChatInterface config={config} />
        </Card>
      </div>
    </div>
  );
}