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

const authSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type AuthForm = z.infer<typeof authSchema>;

export default function AuthPage() {
  const { user, loginMutation, registerMutation, signInWithGoogle, signInWithMicrosoft } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [lastMethod, setLastMethod] = useState<string | null>(null);

  useEffect(() => {
    setLastMethod(localStorage.getItem('lastLoginMethod'));
  }, []);

  const form = useForm<AuthForm>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // Check if user is already authenticated
  if (user) {
    console.log("User is authenticated, redirecting to dashboard");
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
          <CardTitle>{isLogin ? "Login" : "Register"}</CardTitle>
          <CardDescription>
            {isLogin
              ? "Welcome back! Please login to continue."
              : "Create an account to get started."}
          </CardDescription>
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
                      <Input
                        type="password"
                        placeholder="Enter your password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                <Button
                  type="submit"
                  className="w-full flex items-center justify-between"
                  disabled={loginMutation.isPending || registerMutation.isPending}
                >
                  <span>{isLogin ? "Login" : "Register"}</span>
                  {lastMethod === 'email' && isLogin && (
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
                    <span className="bg-background px-2 text-muted-foreground">
                      Or continue with
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full flex items-center justify-between gap-2"
                  onClick={() => {
                    track(EventName.USER_GOOGLE_LOGIN);
                    signInWithGoogle();
                  }}
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
                  onClick={() => signInWithMicrosoft()}
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
                  onClick={() => setIsLogin(!isLogin)}
                >
                  {isLogin
                    ? "Don't have an account? Register"
                    : "Already have an account? Login"}
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