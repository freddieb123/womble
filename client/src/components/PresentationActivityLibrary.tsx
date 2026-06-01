import { useQuery } from "@tanstack/react-query";
import { useDraggable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";

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
};

interface Props {
  presentationId: number;
}

function DraggableActivityItem({ config }: { config: ChatConfig }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `library:${config.id}`,
    data: { source: "library", config },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-1 px-2 py-2 rounded border transition-colors cursor-grab active:cursor-grabbing ${
        isDragging
          ? "opacity-50 bg-blue-50 border-blue-200"
          : "border-transparent hover:bg-blue-50 hover:border-blue-200"
      }`}
    >
      <div {...listeners} {...attributes} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
        <GripVertical className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-blue-600 font-medium">{ACTIVITY_TYPE_LABELS[config.type] ?? config.type}</div>
        <div className="text-xs text-gray-700 truncate">{config.title}</div>
      </div>
    </div>
  );
}

export default function PresentationActivityLibrary({ presentationId }: Props) {
  const { data: configs } = useQuery<ChatConfig[]>({
    queryKey: ["/api/presentations", presentationId, "activities"],
    queryFn: async () => {
      const res = await fetch(`/api/presentations/${presentationId}/activities`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const available = (configs ?? []).filter(c => c.type !== 'two-way-conversation');

  return (
    <div className="flex flex-col h-full">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 px-1">Activities</div>
      <p className="text-xs text-gray-400 px-1 mb-2">Drag into the timeline below</p>
      <div className="flex-1 overflow-y-auto space-y-0.5">
        {available.length === 0 && (
          <p className="text-xs text-gray-400 px-1">No activities in this session.</p>
        )}
        {available.map(config => (
          <DraggableActivityItem key={config.id} config={config} />
        ))}
      </div>
    </div>
  );
}
