import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { SiGoogle } from "react-icons/si";
import { TbBrandWindows } from "react-icons/tb";
import { track, EventName } from "@/lib/mixpanel";
import {
  MessageSquare, Users, GraduationCap, Brain, Zap,
  Monitor, FileText, ClipboardList, LayoutGrid,
} from "lucide-react";

const authSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type AuthForm = z.infer<typeof authSchema>;

const ACTIVITY_TYPES = [
  { icon: MessageSquare, label: "Conversation with AI",    subtitle: "Role-play with an AI character" },
  { icon: Users,         label: "Two-way Conversation",   subtitle: "Practise real conversations" },
  { icon: GraduationCap, label: "Teach an AI",            subtitle: "Explain topics to an AI learner" },
  { icon: Brain,         label: "Thought Partner",        subtitle: "Think through ideas together" },
  { icon: Zap,           label: "Quick Fire Quiz",         subtitle: "Kahoot-style live quiz" },
  { icon: LayoutGrid,    label: "Group Board",             subtitle: "Collaborative real-time canvas" },
  { icon: Monitor,       label: "User Tester",             subtitle: "AI reviews a prototype demo" },
  { icon: FileText,      label: "Critique a Document",    subtitle: "Coach learners on what to notice" },
  { icon: ClipboardList, label: "Task Walkthrough",        subtitle: "Voice-guided task coaching" },
];

export default function AuthPage() {
  const { user, loginMutation, registerMutation, signInWithGoogle, signInWithMicrosoft } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [lastMethod, setLastMethod] = useState<string | null>(null);

  useEffect(() => {
    setLastMethod(localStorage.getItem('lastLoginMethod'));
  }, []);

  const form = useForm<AuthForm>({
    resolver: zodResolver(authSchema),
    defaultValues: { email: "", password: "" },
  });

  if (user) {
    return <Redirect to="/dashboard" />;
  }

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const mode = searchParams.get('mode');
    if (mode === 'register') setIsLogin(false);
    else if (mode === 'login') setIsLogin(true);
  }, []);

  const onSubmit = (data: AuthForm) => {
    if (isLogin) {
      track(EventName.USER_LOGIN, { method: 'email' });
      loginMutation.mutate(data);
    } else {
      track(EventName.USER_REGISTER, { method: 'email' });
      registerMutation.mutate(data);
    }
  };

  if (loginMutation.isPending || registerMutation.isPending) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-primary"></div>
      </div>
    );
  }

  // ── Register: two-panel layout ───────────────────────────────────────────
  if (!isLogin) {
    return (
      <div className="min-h-screen flex flex-col lg:flex-row">
        {/* Left: form panel */}
        <div className="w-full lg:w-[45%] bg-green-700 flex flex-col p-8 lg:p-12">
          <Link href="/">
            <div className="flex items-center gap-2 mb-10">
              <img src="/womble-icon.svg" alt="Womble" className="h-8 w-8 brightness-0 invert" />
              <span className="text-2xl font-bold text-white">Womble</span>
            </div>
          </Link>

          <h1 className="text-3xl font-bold text-white mb-1">Create your account</h1>
          <p className="text-green-200 text-sm mb-8">Start building activities in minutes — free to get started</p>

          <div className="bg-white rounded-2xl p-6 shadow-xl space-y-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="you@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="At least 6 characters" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold"
                  disabled={registerMutation.isPending}
                >
                  Create account
                </Button>
              </form>
            </Form>

            <div className="relative my-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="w-full flex items-center justify-center gap-2"
                onClick={() => { track(EventName.USER_GOOGLE_LOGIN); signInWithGoogle(); }}
              >
                <SiGoogle className="h-4 w-4" />
                Sign up with Google
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full flex items-center justify-center gap-2"
                onClick={() => { track(EventName.USER_MICROSOFT_LOGIN); signInWithMicrosoft(); }}
              >
                <TbBrandWindows className="h-4 w-4" />
                Sign up with Microsoft
              </Button>
            </div>
          </div>

          <button
            className="mt-6 text-green-200 text-sm hover:text-white transition-colors"
            onClick={() => setIsLogin(true)}
          >
            Already have an account? <span className="underline">Log in</span>
          </button>
        </div>

        {/* Right: activity showcase */}
        <div className="hidden lg:flex w-[55%] bg-gray-50 flex-col items-center justify-center p-12">
          <h2 className="text-3xl font-bold text-gray-900 text-center leading-snug mb-1">
            Nine ways to make learning
          </h2>
          <h2 className="text-3xl font-bold text-center mb-2">
            <span className="bg-green-100 text-green-700 px-2 rounded">actually stick</span>
          </h2>
          <p className="text-gray-400 text-center text-sm mb-10">
            Pick an activity type, write a prompt, share the link — done.
          </p>

          <div className="grid grid-cols-3 gap-x-8 gap-y-7 max-w-lg">
            {ACTIVITY_TYPES.map(({ icon: Icon, label, subtitle }) => (
              <div key={label} className="flex flex-col items-center text-center gap-2">
                <div className="w-12 h-12 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center">
                  <Icon className="h-5 w-5 text-green-600" />
                </div>
                <span className="text-xs font-semibold text-gray-700 leading-tight">{label}</span>
                <span className="text-[11px] text-gray-400 leading-tight">{subtitle}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Login: original layout ───────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted flex flex-col p-4">
      <div className="w-full p-4">
        <Link href="/">
          <div className="flex items-center gap-2">
            <img src="/womble-icon.svg" alt="Womble" className="h-10 w-10" />
            <span className="text-2xl font-bold text-green-700">Womble</span>
          </div>
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Login</CardTitle>
            <CardDescription>Welcome back! Please login to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="Enter your email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Enter your password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="space-y-2">
                  <Button
                    type="submit"
                    className="w-full flex items-center justify-between"
                    disabled={loginMutation.isPending}
                  >
                    <span>Login</span>
                    {lastMethod === 'email' && (
                      <span className="text-xs bg-white/20 rounded-full px-2 py-0.5 font-medium">
                        Last used
                      </span>
                    )}
                  </Button>
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full flex items-center justify-between gap-2"
                    onClick={() => { track(EventName.USER_GOOGLE_LOGIN); signInWithGoogle(); }}
                  >
                    <span className="flex items-center gap-2">
                      <SiGoogle className="h-4 w-4" />
                      Sign in with Google
                    </span>
                    {lastMethod === 'google' && (
                      <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-medium">
                        Last used
                      </span>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full flex items-center justify-between gap-2"
                    onClick={() => { track(EventName.USER_MICROSOFT_LOGIN); signInWithMicrosoft(); }}
                  >
                    <span className="flex items-center gap-2">
                      <TbBrandWindows className="h-4 w-4" />
                      Sign in with Microsoft
                    </span>
                    {lastMethod === 'microsoft' && (
                      <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-medium">
                        Last used
                      </span>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => setIsLogin(false)}
                  >
                    Don't have an account? Register
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
