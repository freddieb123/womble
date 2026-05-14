import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Keyboard, Mic } from "lucide-react";

export type ChatMode = 'typed' | 'spoken';

interface UserNameModalProps {
  open: boolean;
  onSubmit: (name: string, mode: ChatMode) => void;
}

export default function UserNameModal({ open, onSubmit }: UserNameModalProps) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<ChatMode>('typed');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName) {
      onSubmit(trimmedName, mode);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome!</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 pt-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name..."
            className="w-full"
            autoFocus
          />

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">How would you like to interact?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('typed')}
                className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors
                  ${mode === 'typed' ? 'border-green-500 bg-green-50 text-green-800' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <Keyboard className="h-5 w-5" />
                <span className="font-medium">Typed</span>
                <span className="text-xs text-muted-foreground">Chat by typing</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('spoken')}
                className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors
                  ${mode === 'spoken' ? 'border-green-500 bg-green-50 text-green-800' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <Mic className="h-5 w-5" />
                <span className="font-medium">Spoken</span>
                <span className="text-xs text-muted-foreground">Talk out loud</span>
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={!name.trim()}>
            {mode === 'spoken' ? 'Start Voice Session' : 'Start Chat'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}