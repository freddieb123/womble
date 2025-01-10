import { useState } from "react";
import { Card, CardHeader, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Copy, ExternalLink, MoreVertical, BarChart2, Trash2, ArrowUpCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AdminPanel from "@/components/AdminPanel";
import type { AdminConfig } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";

type ChatConfig = {
  id: number;
  title: string;
  type: 'chat' | 'upload';  // Make type required and properly typed
  systemPrompt: string;
  userInstructions: string | null;
  feedbackCriteria: string | null;
  createdAt: string;
  conversationCount: number;
  deleted?: boolean;
  deletedAt?: string;
};

export default function Home() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ChatConfig | null>(null);
  const [deletingConfig, setDeletingConfig] = useState<ChatConfig | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [config, setConfig] = useState<AdminConfig>({
    title: "",
    type: "chat",
    systemPrompt: "You are a helpful AI assistant.",
    userInstructions: "",
    feedbackCriteria: "",
    temperature: 0.7,
    maxTokens: 1000
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: configs, isLoading } = useQuery<ChatConfig[]>({
    queryKey: ['/api/chat-configs', showDeleted],
    queryFn: async () => {
      const response = await fetch(`/api/chat-configs${showDeleted ? '?showDeleted=true' : ''}`);
      if (!response.ok) {
        throw new Error('Failed to fetch GPT');
      }
      return response.json();
    }
  });

  const saveConfig = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/chat-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: config.title,
          type: config.type,
          systemPrompt: config.systemPrompt,
          userInstructions: config.userInstructions,
          feedbackCriteria: config.feedbackCriteria,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save GPT");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat-configs'] });
      setIsCreateOpen(false);
      setConfig({
        title: "",
        type: "chat",
        systemPrompt: "You are a helpful AI assistant.",
        userInstructions: "",
        feedbackCriteria: "",
        temperature: 0.7,
        maxTokens: 1000
      });
      toast({
        description: "GPT saved successfully!",
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
        body: JSON.stringify({
          ...configToUpdate,
          type: configToUpdate.type,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update GPT");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat-configs'] });
      setEditingConfig(null);
      toast({
        description: "GPT updated successfully!",
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

  const deleteConfig = useMutation({
    mutationFn: async (configToDelete: ChatConfig) => {
      const response = await fetch(`/api/chat-configs/${configToDelete.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete GPT");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat-configs'] });
      setDeletingConfig(null);
      toast({
        description: "GPT deleted successfully!",
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

  const restoreConfig = useMutation({
    mutationFn: async (configToRestore: ChatConfig) => {
      const response = await fetch(`/api/chat-configs/${configToRestore.id}/restore`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to restore GPT");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat-configs'] });
      toast({
        description: "GPT restored successfully!",
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

  const handleViewFeedback = (configId: number) => {
    window.open(`${window.location.origin}/analysis?configId=${configId}`, '_blank');
  };

  const handleDuplicate = (configToDuplicate: ChatConfig) => {
    setConfig({
      title: `${configToDuplicate.title} (Copy)`,
      type: configToDuplicate.type,
      systemPrompt: configToDuplicate.systemPrompt,
      userInstructions: configToDuplicate.userInstructions || "",
      feedbackCriteria: configToDuplicate.feedbackCriteria || "",
      temperature: 0.7,
      maxTokens: 1000,
    });
    setIsCreateOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="p-6">
            <CardContent>Loading GPTs...</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-blue-900">Durable Skills GPTs</h1>
            <Switch
              checked={showDeleted}
              onCheckedChange={setShowDeleted}
              className="ml-4"
            />
            <span className="text-sm text-muted-foreground">
              Show deleted configs
            </span>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New GPT
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Create New GPT</DialogTitle>
              </DialogHeader>
              <ScrollArea className="flex-1 -mx-6 px-6">
                <div className="py-4">
                  <AdminPanel config={config} onConfigChange={setConfig} />
                </div>
              </ScrollArea>
              <div className="pt-4 border-t flex justify-end">
                <Button onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending}>
                  Save GPT
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <ScrollArea className="h-[calc(100vh-12rem)]">
          <div className="space-y-4">
            {configs?.map((config) => (
              <Card
                key={config.id}
                className={`p-6 ${config.deleted ? 'opacity-60' : ''}`}
              >
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{config.title}</CardTitle>
                      <CardDescription>
                        Created on: {new Date(config.createdAt).toLocaleDateString()}
                        {config.deleted && config.deletedAt && (
                          <span className="text-red-500 ml-2">
                            (Deleted on: {new Date(config.deletedAt).toLocaleDateString()})
                          </span>
                        )}
                      </CardDescription>
                    </div>
                    <div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!config.deleted ? (
                            <>
                              <DropdownMenuItem onClick={() => setEditingConfig(config)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicate(config)}>
                                <Copy className="h-4 w-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => setDeletingConfig(config)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => restoreConfig.mutate(config)}
                            >
                              <ArrowUpCircle className="h-4 w-4 mr-2" />
                              Restore
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Dialog open={editingConfig?.id === config.id} onOpenChange={(open) => !open && setEditingConfig(null)}>
                        <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
                          <DialogHeader>
                            <DialogTitle>Edit GPT</DialogTitle>
                          </DialogHeader>
                          {editingConfig && (
                            <>
                              <ScrollArea className="flex-1 -mx-6 px-6">
                                <div className="py-4">
                                  <AdminPanel
                                    config={{
                                      title: editingConfig.title,
                                      type: editingConfig.type,
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
                                        type: updatedConfig.type,
                                        systemPrompt: updatedConfig.systemPrompt,
                                        userInstructions: updatedConfig.userInstructions || null,
                                        feedbackCriteria: updatedConfig.feedbackCriteria || null,
                                      });
                                    }}
                                    isEditMode={true}
                                  />
                                </div>
                              </ScrollArea>
                              <div className="mt-4 pt-4 border-t flex justify-end">
                                <Button
                                  onClick={() => editingConfig && updateConfig.mutate(editingConfig)}
                                  disabled={updateConfig.isPending}
                                >
                                  Update GPT
                                </Button>
                              </div>
                            </>
                          )}
                        </DialogContent>
                      </Dialog>
                    </div>
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
                    <div className="flex justify-between items-center">
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleCopyLink(config.id)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Link
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleViewFeedback(config.id)}
                          disabled={!config.feedbackCriteria || config.conversationCount === 0}
                        >
                          <BarChart2 className="h-4 w-4 mr-2" />
                          <span className="md:hidden">View Feedback</span>
                          <span className="hidden md:inline">View Current Feedback</span>
                        </Button>
                      </div>
                      <span className="hidden md:inline text-sm text-muted-foreground">
                        {config.conversationCount} conversation{config.conversationCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>
      <AlertDialog
        open={deletingConfig !== null}
        onOpenChange={(open) => !open && setDeletingConfig(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the GPT
              "{deletingConfig?.title}" and all associated conversations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deletingConfig && deleteConfig.mutate(deletingConfig)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}