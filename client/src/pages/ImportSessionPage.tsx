import { useState } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Loader2, CheckCircle2, Users, AlertCircle } from "lucide-react";

type ImportPreview = {
  title: string;
  sharedBy: string | null;
  activities: { title: string; type: string }[];
};

export default function ImportSessionPage() {
  const [, params] = useRoute("/import/:token");
  const token = params?.token ?? "";
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [added, setAdded] = useState(false);

  const { data: preview, isLoading, isError } = useQuery<ImportPreview>({
    queryKey: [`/api/import/${token}`],
    enabled: !!token,
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/import/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ id: number }>;
    },
    onSuccess: (session) => {
      setAdded(true);
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      toast({ description: "Session added to your account!" });
      navigate(`/dashboard?session=${session.id}`);
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Couldn't add this session. Please try again." });
    },
  });

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">{children}</Card>
    </div>
  );

  if (isLoading || authLoading) {
    return (
      <Shell>
        <CardContent className="py-16 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Shell>
    );
  }

  if (isError || !preview) {
    return (
      <Shell>
        <CardHeader className="text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
          <CardTitle>Link not found</CardTitle>
          <CardDescription>This shared session link is invalid or has been removed.</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center pb-6">
          <Link href="/">
            <Button variant="outline">Go to Womble</Button>
          </Link>
        </CardContent>
      </Shell>
    );
  }

  return (
    <Shell>
      <CardHeader className="text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <img src="/womble-icon.svg" alt="Womble" className="h-7 w-7" />
          <span className="text-xl font-bold">Womble</span>
        </div>
        <CardTitle className="text-2xl">
          {preview.sharedBy ? `${preview.sharedBy} shared a session with you` : "A session has been shared with you"}
        </CardTitle>
        <CardDescription>
          Add “{preview.title}” to your account to run it with your own learners. You’ll get your own copy of every
          activity — none of the original learner data is included.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border bg-card p-4">
          <div className="font-semibold mb-2">{preview.title}</div>
          {preview.activities.length > 0 ? (
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {preview.activities.map((a, i) => (
                <li key={i} className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                  <span className="truncate">{a.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No activities in this session.</p>
          )}
        </div>

        {user ? (
          <Button
            className="w-full"
            size="lg"
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending || added}
          >
            {importMutation.isPending || added ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Users className="h-4 w-4 mr-2" />
            )}
            Add to my Womble
          </Button>
        ) : (
          <div className="space-y-2">
            <Button
              className="w-full"
              size="lg"
              onClick={() => navigate(`/auth?mode=register&redirect=${encodeURIComponent(`/import/${token}`)}`)}
            >
              Create an account to add it
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate(`/auth?mode=login&redirect=${encodeURIComponent(`/import/${token}`)}`)}
            >
              Sign in
            </Button>
            <p className="text-xs text-muted-foreground text-center pt-1">
              After signing in you’ll be brought straight back here.
            </p>
          </div>
        )}
      </CardContent>
    </Shell>
  );
}
