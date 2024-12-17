import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Settings2 } from "lucide-react";
import ChatInterface from "@/components/ChatInterface";
import AdminPanel from "@/components/AdminPanel";
import { AdminConfig } from "@/lib/types";

export default function Home() {
  const [showAdmin, setShowAdmin] = useState(false);
  const [config, setConfig] = useState<AdminConfig>({
    systemPrompt: "You are a helpful AI assistant.",
    temperature: 0.7,
    maxTokens: 1000
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-blue-900">AI Chat Interface</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowAdmin(!showAdmin)}
            className="hover:bg-blue-100"
          >
            <Settings2 className="h-5 w-5" />
          </Button>
        </div>

        <div className="grid gap-6 grid-cols-1 lg:grid-cols-5">
          <Card className={`p-6 ${showAdmin ? 'lg:col-span-3' : 'lg:col-span-5'}`}>
            <ChatInterface config={config} />
          </Card>

          {showAdmin && (
            <Card className="p-6 lg:col-span-2">
              <AdminPanel config={config} onConfigChange={setConfig} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
