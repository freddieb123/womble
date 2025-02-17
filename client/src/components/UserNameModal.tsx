import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface UserNameModalProps {
  open: boolean;
  onSubmit: (name: string) => void;
}

export default function UserNameModal({ open, onSubmit }: UserNameModalProps) {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName) {
      onSubmit(trimmedName);
      console.log("Submitting name:", trimmedName);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome!</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name..."
            className="w-full"
            autoFocus
            disabled={false}
          />
          <Button type="submit" className="w-full" disabled={!name.trim()}>
            Start Chat
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}