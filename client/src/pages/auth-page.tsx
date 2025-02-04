import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { SiGoogle } from "react-icons/si";
import { signInWithRedirect } from "firebase/auth";
import { auth, googleProvider, handleGoogleRedirect } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const authSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type AuthForm = z.infer<typeof authSchema>;

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<AuthForm>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  useEffect(() => {
    console.log("Auth page loaded. Current URL:", window.location.href);
    console.log("Checking for Google redirect result...");

    handleGoogleRedirect()
      .then((userData) => {
        console.log("Redirect handler completed:", userData ? "Success" : "No result");
        if (userData) {
          console.log("User data received after redirect");
          queryClient.invalidateQueries({ queryKey: ["/api/user"] });
        }
      })
      .catch((error) => {
        console.error("Google redirect handling error:", error);
        console.error("Full error details:", {
          code: error instanceof Error ? (error as any).code : 'unknown',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          location: window.location.href
        });
        toast({
          variant: "destructive",
          title: "Authentication Error",
          description: error instanceof Error ? error.message : "Failed to complete authentication"
        });
      });
  }, [toast, queryClient]);

  if (user) {
    console.log("User is authenticated, redirecting to home");
    return <Redirect to="/" />;
  }

  const onSubmit = (data: AuthForm) => {
    if (isLogin) {
      loginMutation.mutate(data);
    } else {
      registerMutation.mutate(data);
    }
  };

  const signInWithGoogle = async () => {
    try {
      console.log("Starting Google sign-in process...");
      await signInWithRedirect(auth, googleProvider);
    } catch (error) {
      console.error("Google sign-in error:", error);
      console.error("Error details:", {
        code: error instanceof Error ? (error as any).code : 'unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start Google sign-in"
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center p-4">
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
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter your username" {...field} />
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
                  className="w-full"
                  disabled={loginMutation.isPending || registerMutation.isPending}
                >
                  {isLogin ? "Login" : "Register"}
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
                  className="w-full flex items-center gap-2"
                  onClick={signInWithGoogle}
                >
                  <SiGoogle className="h-4 w-4" />
                  Sign in with Google
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
  );
}