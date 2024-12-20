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

type ChatGPT = {
  id: number;
  title: string;
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
  const [editingGPT, setEditingGPT] = useState<ChatGPT | null>(null);
  const [deletingGPT, setDeletingGPT] = useState<ChatGPT | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [gptConfig, setGPTConfig] = useState<AdminConfig>({
    title: "",
    systemPrompt: "You are a helpful AI assistant.",
    userInstructions: "",
    feedbackCriteria: "",
    temperature: 0.7,
    maxTokens: 1000
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: gpts, isLoading } = useQuery<ChatGPT[]>({
    queryKey: ['/api/chat-gpts', showDeleted],
    queryFn: async () => {
      const response = await fetch(`/api/chat-gpts${showDeleted ? '?showDeleted=true' : ''}`);
      if (!response.ok) {
        throw new Error('Failed to fetch GPT models');
      }
      return response.json();
    }
  });

  const saveGPT = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/chat-gpts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: gptConfig.title,
          systemPrompt: gptConfig.systemPrompt,
          userInstructions: gptConfig.userInstructions,
          feedbackCriteria: gptConfig.feedbackCriteria,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save GPT model");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat-gpts'] });
      setIsCreateOpen(false);
      setGPTConfig({
        title: "",
        systemPrompt: "You are a helpful AI assistant.",
        userInstructions: "",
        feedbackCriteria: "",
        temperature: 0.7,
        maxTokens: 1000
      });
      toast({
        description: "GPT model saved successfully!",
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

  const updateGPT = useMutation({
    mutationFn: async (gptToUpdate: ChatGPT) => {
      const response = await fetch(`/api/chat-gpts/${gptToUpdate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gptToUpdate),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update GPT model");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat-gpts'] });
      setEditingGPT(null);
      toast({
        description: "GPT model updated successfully!",
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

  const deleteGPT = useMutation({
    mutationFn: async (gptToDelete: ChatGPT) => {
      const response = await fetch(`/api/chat-gpts/${gptToDelete.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete GPT model");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat-gpts'] });
      setDeletingGPT(null);
      toast({
        description: "GPT model deleted successfully!",
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

  const restoreGPT = useMutation({
    mutationFn: async (gptToRestore: ChatGPT) => {
      const response = await fetch(`/api/chat-gpts/${gptToRestore.id}/restore`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to restore GPT model");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat-gpts'] });
      toast({
        description: "GPT model restored successfully!",
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

  const handleCopyLink = async (gptId: number) => {
    try {
      const url = `${window.location.origin}/chat?gptId=${gptId}`;
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

  const handleOpenChat = (gptId: number) => {
    window.open(`${window.location.origin}/chat?gptId=${gptId}`, '_blank');
  };

  const handleViewFeedback = (gptId: number) => {
    window.open(`${window.location.origin}/analysis?gptId=${gptId}`, '_blank');
  };

  const handleDuplicate = (gptToDuplicate: ChatGPT) => {
    setGPTConfig({
      title: `${gptToDuplicate.title} (Copy)`,
      systemPrompt: gptToDuplicate.systemPrompt,
      userInstructions: gptToDuplicate.userInstructions || "",
      feedbackCriteria: gptToDuplicate.feedbackCriteria || "",
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
            <CardContent>Loading GPT models...</CardContent>
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
            <h1 className="text-2xl font-bold text-blue-900">AI GPT Models</h1>
            <Switch
              checked={showDeleted}
              onCheckedChange={setShowDeleted}
              className="ml-4"
            />
            <span className="text-sm text-muted-foreground">
              Show deleted GPT models
            </span>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New GPT Model
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Create New GPT Model</DialogTitle>
              </DialogHeader>
              <ScrollArea className="flex-1 -mx-6 px-6">
                <div className="py-4">
                  <AdminPanel config={gptConfig} onConfigChange={setGPTConfig} />
                </div>
              </ScrollArea>
              <div className="pt-4 border-t flex justify-end">
                <Button onClick={() => saveGPT.mutate()} disabled={saveGPT.isPending}>
                  Save GPT Model
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <ScrollArea className="h-[calc(100vh-12rem)]">
          <div className="space-y-4">
            {gpts?.map((gpt) => (
              <Card 
                key={gpt.id} 
                className={`p-6 ${gpt.deleted ? 'opacity-60' : ''}`}
              >
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{gpt.title}</CardTitle>
                      <CardDescription>
                        Created on: {new Date(gpt.createdAt).toLocaleDateString()}
                        {gpt.deleted && gpt.deletedAt && (
                          <span className="text-red-500 ml-2">
                            (Deleted on: {new Date(gpt.deletedAt).toLocaleDateString()})
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
                          {!gpt.deleted ? (
                            <>
                              <DropdownMenuItem onClick={() => setEditingGPT(gpt)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicate(gpt)}>
                                <Copy className="h-4 w-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-red-600"
                                onClick={() => setDeletingGPT(gpt)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <DropdownMenuItem 
                              onClick={() => restoreGPT.mutate(gpt)}
                            >
                              <ArrowUpCircle className="h-4 w-4 mr-2" />
                              Restore
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Dialog open={editingGPT?.id === gpt.id} onOpenChange={(open) => !open && setEditingGPT(null)}>
                        <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
                          <DialogHeader>
                            <DialogTitle>Edit GPT Model</DialogTitle>
                          </DialogHeader>
                          {editingGPT && (
                            <>
                              <ScrollArea className="flex-1 -mx-6 px-6">
                                <div className="py-4">
                                  <AdminPanel
                                    config={{
                                      title: editingGPT.title,
                                      systemPrompt: editingGPT.systemPrompt,
                                      userInstructions: editingGPT.userInstructions || "",
                                      feedbackCriteria: editingGPT.feedbackCriteria || "",
                                      temperature: 0.7,
                                      maxTokens: 1000,
                                    }}
                                    onConfigChange={(updatedConfig) => {
                                      setEditingGPT({
                                        ...editingGPT,
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
                                  onClick={() => editingGPT && updateGPT.mutate(editingGPT)}
                                  disabled={updateGPT.isPending}
                                >
                                  Update GPT Model
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
                        {gpt.systemPrompt.split(' ').slice(0, 30).join(' ')}
                        {gpt.systemPrompt.split(' ').length > 30 ? '...' : ''}
                      </p>
                    </div>
                    {gpt.userInstructions && (
                      <div>
                        <h3 className="font-semibold mb-1">User Instructions</h3>
                        <p className="text-sm text-gray-600">{gpt.userInstructions}</p>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleCopyLink(gpt.id)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Link
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleViewFeedback(gpt.id)}
                          disabled={!gpt.feedbackCriteria || gpt.conversationCount === 0}
                        >
                          <BarChart2 className="h-4 w-4 mr-2" />
                          View Current Feedback
                        </Button>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {gpt.conversationCount} conversation{gpt.conversationCount !== 1 ? 's' : ''}
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
        open={deletingGPT !== null}
        onOpenChange={(open) => !open && setDeletingGPT(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the GPT model
              "{deletingGPT?.title}" and all associated conversations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deletingGPT && deleteGPT.mutate(deletingGPT)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}