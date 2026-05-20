import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X, GripVertical } from "lucide-react";
import type { PresentationFrame } from "@db/schema";

interface Props {
  frames: PresentationFrame[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  onReorder: (frames: PresentationFrame[]) => void;
  onRemove: (i: number) => void;
  onDrop?: (frame: PresentationFrame, insertAt: number) => void;
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  chat: "Chat",
  quiz: "Quiz",
  upload: "Upload",
  "quick-fire-quiz": "Quick Quiz",
  "teach-ai": "Teach AI",
  "thought-partner": "Thought Partner",
  "group-board": "Group Board",
};

function FrameThumbnail({
  frame,
  index,
  isSelected,
  onSelect,
  onRemove,
}: {
  frame: PresentationFrame;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: frame.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex-shrink-0 w-32 h-20 rounded border-2 cursor-pointer group ${isSelected ? "border-blue-500" : "border-gray-200"}`}
      onClick={onSelect}
    >
      {frame.type === "slide" ? (
        <img src={frame.imageDataUrl} alt={`Slide ${index + 1}`} className="w-full h-full object-cover rounded" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-blue-50 rounded text-center px-1">
          <span className="text-xs font-semibold text-blue-700">{ACTIVITY_TYPE_LABELS[frame.configType] ?? frame.configType}</span>
          <span className="text-xs text-blue-500 truncate w-full text-center mt-0.5">{frame.configTitle}</span>
        </div>
      )}
      <span className="absolute bottom-0.5 left-1 text-xs text-white bg-black/40 rounded px-1">{index + 1}</span>
      <button
        className="absolute top-0.5 right-0.5 hidden group-hover:flex items-center justify-center w-5 h-5 bg-red-500 text-white rounded-full text-xs"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
      >
        <X className="h-3 w-3" />
      </button>
      <div
        className="absolute top-0.5 left-0.5 hidden group-hover:flex cursor-grab text-white/80"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3 w-3" />
      </div>
    </div>
  );
}

export default function PresentationFrameStrip({ frames, selectedIndex, onSelect, onReorder, onRemove }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = frames.findIndex(f => f.id === active.id);
    const newIndex = frames.findIndex(f => f.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorder(arrayMove(frames, oldIndex, newIndex));
    }
  };

  if (frames.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 border-2 border-dashed border-gray-200 rounded text-sm text-gray-400">
        Upload slides or drag activities here to build your presentation
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={frames.map(f => f.id)} strategy={horizontalListSortingStrategy}>
        <div className="flex gap-2 overflow-x-auto pb-2 pt-1">
          {frames.map((frame, i) => (
            <FrameThumbnail
              key={frame.id}
              frame={frame}
              index={i}
              isSelected={selectedIndex === i}
              onSelect={() => onSelect(i)}
              onRemove={() => onRemove(i)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
