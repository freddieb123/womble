import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

export default function ChatLinkCreator() {
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string>("");
  const { toast } = useToast();

  // Fetch available chat configurations
  interface ChatConfig {
    id: number;
    title: string;
    systemPrompt: string;
  }

  const { data: configs = [] } = useQuery<ChatConfig[]>({
    queryKey: ["/api/chat-configs"],
  });

  const handleCreateLink = async (configId: number) => {
    try {
      // First verify the config exists
      const configResponse = await fetch(`/api/chat-configs/${configId}`);
      if (!configResponse.ok) {
        throw new Error("Invalid chat configuration");
      }

      const response = await fetch("/api/chat-links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ configId }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to create chat link");
      }

      const data = await response.json();
      if (!data.url) {
        throw new Error("Invalid response format");
      }

      // Construct the full URL with origin
      const fullUrl = `${window.location.origin}${data.url}`;
      setGeneratedLink(fullUrl);

      toast({
        title: "Success",
        description: "Chat link has been created",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create chat link",
      });
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink);
      toast({
        title: "Success",
        description: "Link copied to clipboard",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to copy link",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-blue-900 mb-6">Create Chat Link</h1>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Select Chat Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {configs?.map((config: any) => (
                <div
                  key={config.id}
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedConfigId === config.id
                      ? "bg-blue-100 border-blue-500"
                      : "hover:bg-gray-50"
                  }`}
                  onClick={() => setSelectedConfigId(config.id)}
                >
                  <h3 className="font-semibold">{config.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{config.systemPrompt}</p>
                </div>
              ))}

              {selectedConfigId && (
                <Button
                  className="w-full mt-4"
                  onClick={() => handleCreateLink(selectedConfigId)}
                >
                  Create New Chat Link
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {generatedLink && (
          <Card>
            <CardHeader>
              <CardTitle>Generated Chat Link</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 items-center">
                <Input
                  value={generatedLink}
                  readOnly
                  className="flex-1"
                />
                <Button onClick={copyToClipboard}>Copy</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
