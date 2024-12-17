import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import ChatInterface from "@/components/ChatInterface";
import { AdminConfig } from "@/lib/types";

export default function UserView() {
  // Get instructions from URL parameters
  const [location] = useLocation();
  const params = new URLSearchParams(location.split('?')[1]);
  const instructions = decodeURIComponent(params.get('instructions') || '');
  
  const config: AdminConfig = {
    systemPrompt: instructions || "You are a helpful AI assistant.",
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
