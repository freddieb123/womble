import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  Search, Copy,
  MessageSquare, Users, GraduationCap, Brain, Zap, LayoutGrid, Monitor, FileText, ClipboardList,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type Tab = 'scratch' | 'duplicate';

export type WizardType = 'chat' | 'two-way-conversation' | 'teach-ai' | 'thought-partner' |
  'quick-fire-quiz' | 'group-board' | 'user-tester' | 'doc-critique' | 'task-walkthrough';

type AgentItem = {
  id: number;
  title: string;
  type: string;
  userInstructions: string | null;
  systemPrompt: string;
};

interface Props {
  onSelectTemplate: (template: any) => void;
  onDuplicate: (agent: AgentItem) => void;
  onTypeSelected: (type: WizardType) => void;
}

const ACTIVITY_TYPES: { type: WizardType; label: string; subtitle: string; icon: React.ElementType; color: string }[] = [
  { type: 'chat',                icon: MessageSquare,  label: 'Conversation with AI',  subtitle: 'Learners chat with an AI playing a role',              color: 'text-green-600' },
  { type: 'two-way-conversation',icon: Users,           label: 'Two-way Conversation',  subtitle: 'Two people practise a real conversation together',      color: 'text-orange-500' },
  { type: 'teach-ai',            icon: GraduationCap,  label: 'Teach an AI',           subtitle: 'Learners explain a topic to an AI learner',             color: 'text-blue-600' },
  { type: 'thought-partner',     icon: Brain,           label: 'Thought Partner',       subtitle: 'Helps learners think through how an idea applies',      color: 'text-teal-600' },
  { type: 'quick-fire-quiz',     icon: Zap,             label: 'Quick Fire Quiz',       subtitle: 'Kahoot-style live quiz with speed bonuses',             color: 'text-amber-500' },
  { type: 'group-board',         icon: LayoutGrid,      label: 'Group Board',           subtitle: 'Collaborative canvas — groups add post-its in real time',color: 'text-emerald-600' },
  { type: 'user-tester',         icon: Monitor,         label: 'User Tester',           subtitle: 'AI watches a demo and gives spoken feedback',           color: 'text-violet-600' },
  { type: 'doc-critique',        icon: FileText,        label: 'Critique a Document',   subtitle: 'Apprentices read a doc — AI coaches what to notice',    color: 'text-purple-600' },
  { type: 'task-walkthrough',    icon: ClipboardList,   label: 'Task Walkthrough',      subtitle: 'Talk through a task — AI coaches to completion',        color: 'text-cyan-600' },
];

const TYPE_CLASSES: Record<string, string> = {
  chat: 'bg-green-50 text-green-700 border-green-200',
  'teach-ai': 'bg-blue-50 text-blue-700 border-blue-200',
  'thought-partner': 'bg-teal-50 text-teal-700 border-teal-200',
  'two-way-conversation': 'bg-orange-50 text-orange-700 border-orange-200',
  quiz: 'bg-gray-50 text-gray-600 border-gray-200',
  upload: 'bg-purple-50 text-purple-700 border-purple-200',
  'quick-fire-quiz': 'bg-amber-50 text-amber-700 border-amber-200',
  'group-board': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'user-tester': 'bg-violet-50 text-violet-700 border-violet-200',
  'doc-critique': 'bg-blue-50 text-blue-700 border-blue-200',
  'task-walkthrough': 'bg-cyan-50 text-cyan-700 border-cyan-200',
};

const TYPE_LABEL: Record<string, string> = {
  chat: 'Conversation', 'teach-ai': 'Teach an AI', 'thought-partner': 'Thought Partner',
  'two-way-conversation': 'Two-way', quiz: 'Quiz', upload: 'Document Review',
  'quick-fire-quiz': 'Quick Fire Quiz', 'group-board': 'Group Board',
  'user-tester': 'User Tester', 'doc-critique': 'Doc Critique', 'task-walkthrough': 'Task Walkthrough',
};

export default function AddAgentDialog({ onDuplicate, onTypeSelected }: Props) {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('scratch');
  const [search, setSearch] = useState('');

  const { data: agents = [], isLoading } = useQuery<AgentItem[]>({
    queryKey: ['/api/chat-configs', user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/chat-configs?userId=${user?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user?.id,
  });

  const filteredAgents = agents.filter(a =>
    a.title.toLowerCase().includes(search.toLowerCase())
  );

  const hasAgents = agents.length > 0;

  return (
    <div className="flex flex-col h-full -mt-6">
      {/* Green header */}
      <div className="bg-green-700 text-white px-6 pt-6 pb-5 -mx-6 mb-4 rounded-t-lg flex-shrink-0">
        <h2 className="text-xl font-bold mb-1">Add Activity</h2>
        <p className="text-green-200 text-sm mb-4">Build a new activity from scratch or duplicate an existing one</p>

        <div className="flex gap-1 bg-green-800/60 rounded-lg p-1 w-fit">
          <button
            onClick={() => { setTab('scratch'); setSearch(''); }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'scratch' ? 'bg-white text-green-800 shadow-sm' : 'text-green-100 hover:text-white'
            }`}
          >
            Build from scratch
          </button>
          <button
            onClick={() => setTab('duplicate')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'duplicate' ? 'bg-white text-green-800 shadow-sm' : 'text-green-100 hover:text-white'
            }`}
          >
            Duplicate existing
          </button>
        </div>
      </div>

      {tab === 'scratch' && (
        <div className="flex-1 overflow-hidden">
          <div className="grid grid-cols-3 gap-2 h-full pb-2">
            {ACTIVITY_TYPES.map(({ type, label, subtitle, icon: Icon, color }) => (
              <button
                key={type}
                type="button"
                onClick={() => onTypeSelected(type)}
                className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-gray-200 p-3 text-center transition-colors hover:border-green-400 hover:bg-green-50/50 group"
              >
                <Icon className={`h-6 w-6 ${color} group-hover:scale-110 transition-transform`} />
                <div className="font-medium text-gray-900 text-xs leading-tight">{label}</div>
                <div className="text-gray-400 text-[10px] leading-tight">{subtitle}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'duplicate' && (
        <>
          <div className="relative mb-4 flex-shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search your activities…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {!hasAgents && !isLoading ? (
            <div className="flex-1 flex items-center justify-center text-center text-gray-400 text-sm">
              <p>No activities yet. Use &ldquo;Build from scratch&rdquo; to create your first one.</p>
            </div>
          ) : (
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-2 pb-4">
                {filteredAgents.map((agent) => (
                  <div
                    key={agent.id}
                    onClick={() => onDuplicate(agent)}
                    className="flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-3 cursor-pointer hover:border-green-400 hover:bg-green-50/40 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{agent.title}</p>
                      {agent.userInstructions && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{agent.userInstructions}</p>
                      )}
                    </div>
                    <Badge variant="outline" className={`text-xs flex-shrink-0 ${TYPE_CLASSES[agent.type] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      {TYPE_LABEL[agent.type] ?? agent.type}
                    </Badge>
                    <Copy className="h-4 w-4 text-gray-400 group-hover:text-green-600 flex-shrink-0 transition-colors" />
                  </div>
                ))}
                {filteredAgents.length === 0 && (
                  <div className="text-center py-10 text-gray-400 text-sm">No activities match your search.</div>
                )}
              </div>
            </ScrollArea>
          )}
        </>
      )}
    </div>
  );
}
