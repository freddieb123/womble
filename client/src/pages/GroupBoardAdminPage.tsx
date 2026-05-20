import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AdminConfig } from "@/lib/types";
import GroupBoardInterface from "@/components/GroupBoardInterface";
import WombleHeader from "@/components/WombleHeader";
import { Card } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function GroupBoardAdminPage() {
  const { id } = useParams<{ id: string }>();

  const { data: savedConfig, isLoading, error } = useQuery<any>({
    queryKey: [`/api/chat-configs/${id}`],
    enabled: !!id,
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-blue-900 text-sm">Loading board...</div>
      </div>
    );
  }

  if (error || !savedConfig) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <Card className="p-6 max-w-md mx-auto">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">Failed to load board configuration.</p>
          </div>
        </Card>
      </div>
    );
  }

  const config: AdminConfig = {
    id: savedConfig.id,
    type: savedConfig.type,
    title: savedConfig.title,
    systemPrompt: savedConfig.systemPrompt,
    userInstructions: savedConfig.userInstructions || '',
    feedbackCriteria: savedConfig.feedbackCriteria || '',
    temperature: 0.7,
    maxTokens: 1000,
    groupBoardSettings: savedConfig.groupBoardSettings ?? undefined,
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <WombleHeader />
      <div className="flex-1 overflow-hidden px-4 py-3">
        <div className="max-w-6xl mx-auto h-full flex flex-col">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Trainer view</span>
            <span className="text-xs text-gray-400">— participants see this board live</span>
          </div>
          <Card className="flex-1 overflow-hidden">
            <GroupBoardInterface
              config={config}
              userName="Trainer"
              isAdmin={true}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
