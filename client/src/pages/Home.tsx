import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const [instructions, setInstructions] = useState("You are a helpful AI assistant.");
  const { toast } = useToast();

  const handleCopyLink = () => {
    const params = new URLSearchParams();
    params.set('instructions', encodeURIComponent(instructions));
    const url = `${window.location.origin}/chat?${params.toString()}`;
    
    navigator.clipboard.writeText(url).then(() => {
      toast({
        description: "Link copied to clipboard!",
      });
    });
  };

  const handleOpenChat = () => {
    const params = new URLSearchParams();
    params.set('instructions', encodeURIComponent(instructions));
    window.open(`/chat?${params.toString()}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-blue-900">AI Chat Admin</h1>
        </div>

        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-2">Chat Instructions</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Enter the instructions for the AI assistant. These will be used as the system prompt.
              </p>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Enter instructions for the AI assistant..."
                className="min-h-[200px]"
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleCopyLink}>
                <Copy className="h-4 w-4 mr-2" />
                Copy Link
              </Button>
              <Button variant="outline" onClick={handleOpenChat}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Chat
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
