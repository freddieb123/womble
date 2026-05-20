import { useQuery } from "@tanstack/react-query";
import type { PresentationFrame } from "@db/schema";

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  chat: "Chat",
  quiz: "Quiz",
  upload: "Document Review",
  "quick-fire-quiz": "Quick Fire Quiz",
  "teach-ai": "Teach AI",
  "thought-partner": "Thought Partner",
  "group-board": "Group Board",
  "two-way-conversation": "Two-way Conversation",
};

type ChatConfig = {
  id: number;
  title: string;
  type: string;
  deleted: boolean;
};

interface Props {
  onAdd: (frame: PresentationFrame) => void;
}

export default function PresentationActivityLibrary({ onAdd }: Props) {
  const { data: configs } = useQuery<ChatConfig[]>({
    queryKey: ["/api/chat-configs"],
    staleTime: 30_000,
  });

  const available = (configs ?? []).filter(c => !c.deleted && c.type !== 'two-way-conversation');

  return (
    <div className="flex flex-col h-full">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">Activities</div>
      <div className="flex-1 overflow-y-auto space-y-1">
        {available.length === 0 && (
          <p className="text-xs text-gray-400 px-1">No activities yet. Create some from the dashboard.</p>
        )}
        {available.map(config => (
          <button
            key={config.id}
            onClick={() => onAdd({
              id: globalThis.crypto.randomUUID(),
              type: "activity",
              configId: config.id,
              configTitle: config.title,
              configType: config.type,
            })}
            className="w-full text-left px-2 py-2 rounded hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-colors"
          >
            <div className="text-xs text-blue-600 font-medium">{ACTIVITY_TYPE_LABELS[config.type] ?? config.type}</div>
            <div className="text-xs text-gray-700 truncate">{config.title}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
