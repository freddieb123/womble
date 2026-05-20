import { useState } from "react";
import { Maximize2 } from "lucide-react";

interface Props {
  onDismiss: () => void;
}

export default function FullscreenPrompt({ onDismiss }: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleClick = () => {
    document.documentElement.requestFullscreen().catch(() => {});
    setDismissed(true);
    onDismiss();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-6 pointer-events-none">
      <button
        onClick={handleClick}
        className="pointer-events-auto flex items-center gap-2 bg-gray-900 text-white px-5 py-3 rounded-full shadow-lg hover:bg-gray-700 transition-colors text-sm font-medium"
      >
        <Maximize2 className="h-4 w-4" />
        Your presenter has asked everyone to go fullscreen — click here
      </button>
    </div>
  );
}
