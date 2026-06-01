import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { X, GripVertical, FileCode2, Layers } from "lucide-react";
import type { PresentationFrame } from "@db/schema";

interface Props {
  frames: PresentationFrame[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  onReorder: (frames: PresentationFrame[]) => void;
  onRemove: (i: number) => void;
  isDraggingFromLibrary?: boolean;
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

function DropZone({ id }: { id: string }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-4 rounded transition-all ${isOver ? "bg-blue-400 w-8" : "bg-transparent"}`}
    />
  );
}

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
      className={`relative flex-shrink-0 w-28 h-18 rounded border-2 cursor-pointer group ${
        isSelected ? "border-blue-500" : "border-gray-200 hover:border-gray-300"
      }`}
      onClick={onSelect}
    >
      <div className="h-18 min-h-[4.5rem]">
        {frame.type === "html-slide" ? (
          <div className="w-full h-full min-h-[4.5rem] flex flex-col items-center justify-center bg-gray-800 rounded text-center px-1 gap-0.5">
            <FileCode2 className="h-4 w-4 text-gray-400" />
            <span className="text-xs text-gray-300 font-medium">Slide {frame.slideIndex + 1}</span>
          </div>
        ) : frame.type === "html-deck" ? (
          <div className="w-full h-full min-h-[4.5rem] flex flex-col items-center justify-center bg-gray-800 rounded text-center px-1 gap-0.5">
            <Layers className="h-4 w-4 text-gray-400" />
            <span className="text-xs text-gray-400">HTML Deck</span>
          </div>
        ) : (
          <div className="w-full h-full min-h-[4.5rem] flex flex-col items-center justify-center bg-blue-50 rounded text-center px-1">
            <span className="text-xs font-semibold text-blue-700">{ACTIVITY_TYPE_LABELS[frame.configType] ?? frame.configType}</span>
            <span className="text-xs text-blue-500 truncate w-full text-center mt-0.5">{frame.configTitle}</span>
          </div>
        )}
      </div>
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

export default function PresentationFrameStrip({
  frames,
  selectedIndex,
  onSelect,
  onReorder,
  onRemove,
  isDraggingFromLibrary,
}: Props) {
  if (frames.length === 0) {
    return (
      <div className={`flex items-center justify-center h-24 border-2 border-dashed rounded text-sm text-gray-400 transition-colors ${
        isDraggingFromLibrary ? "border-blue-400 bg-blue-50 text-blue-500" : "border-gray-200"
      }`}>
        {isDraggingFromLibrary ? "Drop here to add activity" : "Upload an HTML deck or drag activities here"}
      </div>
    );
  }

  return (
    <SortableContext items={frames.map(f => f.id)} strategy={horizontalListSortingStrategy}>
      <div className={`flex items-center gap-0 overflow-x-auto pb-2 pt-1 px-1 rounded transition-colors ${
        isDraggingFromLibrary ? "bg-blue-50 ring-2 ring-blue-200" : ""
      }`}>
        <DropZone id="drop-before-0" />
        {frames.map((frame, i) => (
          <div key={frame.id} className="flex items-center">
            <FrameThumbnail
              frame={frame}
              index={i}
              isSelected={selectedIndex === i}
              onSelect={() => onSelect(i)}
              onRemove={() => onRemove(i)}
            />
            <DropZone id={`drop-after-${i}`} />
          </div>
        ))}
      </div>
    </SortableContext>
  );
}
