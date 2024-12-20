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
  feedbackCriteria: string | null;
  createdAt: string;
  conversationCount: number;
};

export default function Home() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ChatConfig | null>(null);
  const [config, setConfig] = useState<AdminConfig>({
    title: "",
    systemPrompt: "You are a helpful AI assistant.",
    userInstructions: "",
    feedbackCriteria: "",
    temperature: 0.7,
    maxTokens: 1000
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

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
          feedbackCriteria: config.feedbackCriteria,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save configuration");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat-configs'] });
      setIsCreateOpen(false);
      setConfig({
        title: "",
        systemPrompt: "You are a helpful AI assistant.",
        userInstructions: "",
        feedbackCriteria: "",
        temperature: 0.7,
        maxTokens: 1000
      });
      toast({
        description: "Configuration saved successfully!",
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
          <div className="flex gap-4">
            <Button variant="outline" onClick={() => window.location.href = '/analysis'}>
              View Conversations
            </Button>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Configuration
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>Create New Configuration</DialogTitle>
                </DialogHeader>
                <ScrollArea className="flex-1 -mx-6 px-6">
                  <div className="py-4">
                    <AdminPanel config={config} onConfigChange={setConfig} />
                  </div>
                </ScrollArea>
                <div className="pt-4 border-t flex justify-end">
                  <Button onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending}>
                    Save Configuration
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <ScrollArea className="h-[calc(100vh-12rem)]">
          <div className="space-y-4">
            {configs?.map((config) => (
              <Card key={config.id} className="p-6">
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle>{config.title}</CardTitle>
                        <span className="text-sm text-muted-foreground">
                          {config.conversationCount} conversation{config.conversationCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <CardDescription>Created on: {new Date(config.createdAt).toLocaleDateString()}</CardDescription>
                    </div>
                    <Dialog open={editingConfig?.id === config.id} onOpenChange={(open) => !open && setEditingConfig(null)}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="icon" onClick={() => setEditingConfig(config)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
                        <DialogHeader>
                          <DialogTitle>Edit Configuration</DialogTitle>
                        </DialogHeader>
                        {editingConfig && (
                          <>
                            <ScrollArea className="flex-1 -mx-6 px-6">
                              <div className="py-4">
                                <AdminPanel
                                  config={{
                                    title: editingConfig.title,
                                    systemPrompt: editingConfig.systemPrompt,
                                    userInstructions: editingConfig.userInstructions || "",
                                    feedbackCriteria: editingConfig.feedbackCriteria || "",
                                    temperature: 0.7,
                                    maxTokens: 1000,
                                  }}
                                  onConfigChange={(updatedConfig) => {
                                    setEditingConfig({
                                      ...editingConfig,
                                      title: updatedConfig.title,
                                      systemPrompt: updatedConfig.systemPrompt,
                                      userInstructions: updatedConfig.userInstructions || null,
                                      feedbackCriteria: updatedConfig.feedbackCriteria || null,
                                    });
                                  }}
                                />
                              </div>
                            </ScrollArea>
                            <div className="mt-4 pt-4 border-t flex justify-end">
                              <Button
                                onClick={() => editingConfig && updateConfig.mutate(editingConfig)}
                                disabled={updateConfig.isPending}
                              >
                                Update Configuration
                              </Button>
                            </div>
                          </>
                        )}
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold mb-1">System Prompt</h3>
                      <p className="text-sm text-gray-600">
                        {config.systemPrompt.split(' ').slice(0, 30).join(' ')}
                        {config.systemPrompt.split(' ').length > 30 ? '...' : ''}
                      </p>
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