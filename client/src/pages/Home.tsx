import { useState } from "react";
import { Card, CardHeader, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Copy, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AdminPanel from "@/components/AdminPanel";
import type { AdminConfig } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

type ChatConfig = {
  id: number;
  title: string;
  systemPrompt: string;
  userInstructions: string | null;
  createdAt: string;
};

export default function Home() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ChatConfig | null>(null);
  const [config, setConfig] = useState<AdminConfig>({
    title: "",
    systemPrompt: "You are a helpful AI assistant.",
    userInstructions: "",
    temperature: 0.7,
    maxTokens: 1000
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all chat configurations
  const { data: configs, isLoading } = useQuery<ChatConfig[]>({
    queryKey: ['/api/chat-configs'],
  });

  const saveConfig = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/chat-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: config.title,
          systemPrompt: config.systemPrompt,
          userInstructions: config.userInstructions,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save configuration");
      }
      
      return response.json();
    },
    onSuccess: (savedConfig) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat-configs'] });
      setIsCreateOpen(false);
      setConfig({
        title: "",
        systemPrompt: "You are a helpful AI assistant.",
        userInstructions: "",
        temperature: 0.7,
        maxTokens: 1000
      });
      toast({
        description: "Configuration saved successfully!",
      });
      return savedConfig;
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const updateConfig = useMutation({
    mutationFn: async (configToUpdate: ChatConfig) => {
      const response = await fetch(`/api/chat-configs/${configToUpdate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configToUpdate),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update configuration");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat-configs'] });
      setEditingConfig(null);
      toast({
        description: "Configuration updated successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const handleCopyLink = async (configId: number) => {
    try {
      const url = `${window.location.origin}/chat?configId=${configId}`;
      await navigator.clipboard.writeText(url);
      toast({
        description: "Link copied to clipboard!",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to copy link",
      });
    }
  };

  const handleOpenChat = (configId: number) => {
    window.open(`${window.location.origin}/chat?configId=${configId}`, '_blank');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="p-6">
            <CardContent>Loading configurations...</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-blue-900">AI Chat Configurations</h1>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Configuration
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Configuration</DialogTitle>
              </DialogHeader>
              <div className="mt-4">
                <AdminPanel config={config} onConfigChange={setConfig} />
                <div className="mt-4 flex justify-end">
                  <Button onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending}>
                    Save Configuration
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <ScrollArea className="h-[calc(100vh-12rem)]">
          <div className="space-y-4">
            {configs?.map((config) => (
              <Card key={config.id} className="p-6">
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{config.title}</CardTitle>
                      <CardDescription>Created on: {new Date(config.createdAt).toLocaleDateString()}</CardDescription>
                    </div>
                    <Dialog open={editingConfig?.id === config.id} onOpenChange={(open) => !open && setEditingConfig(null)}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="icon" onClick={() => setEditingConfig(config)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Edit Configuration</DialogTitle>
                        </DialogHeader>
                        {editingConfig && (
                          <div className="mt-4">
                            <AdminPanel
                              config={{
                                ...editingConfig,
                                temperature: 0.7,
                                maxTokens: 1000,
                              }}
                              onConfigChange={(updatedConfig) => {
                                setEditingConfig({
                                  ...editingConfig,
                                  title: updatedConfig.title,
                                  systemPrompt: updatedConfig.systemPrompt,
                                  userInstructions: updatedConfig.userInstructions || null,
                                });
                              }}
                            />
                            <div className="mt-4 flex justify-end">
                              <Button
                                onClick={() => editingConfig && updateConfig.mutate(editingConfig)}
                                disabled={updateConfig.isPending}
                              >
                                Update Configuration
                              </Button>
                            </div>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold mb-1">System Prompt</h3>
                      <p className="text-sm text-gray-600">{config.systemPrompt}</p>
                    </div>
                    {config.userInstructions && (
                      <div>
                        <h3 className="font-semibold mb-1">User Instructions</h3>
                        <p className="text-sm text-gray-600">{config.userInstructions}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleCopyLink(config.id)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Link
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleOpenChat(config.id)}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open Chat
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
