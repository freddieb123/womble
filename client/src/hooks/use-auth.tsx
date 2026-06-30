import React, { ReactNode, createContext, useContext, useEffect, useState } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import { signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { identify, reset, track, EventName } from "@/lib/mixpanel";
import type { SelectUser, InsertUser } from "@db/schema";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { auth, googleProvider, microsoftProvider } from "@/lib/firebase";

type AuthContextType = {
  user: SelectUser | null;
  firebaseUser: User | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, InsertUser>;
  signInWithGoogle: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
};

type LoginData = Pick<InsertUser, "email" | "password">;

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [firebaseUser, setFirebaseUser] = React.useState<User | null>(null);

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log("Firebase auth state changed:", user ? "User logged in" : "No user");
      setFirebaseUser(user);
    });
    return () => unsubscribe();
  }, []);

  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | null, Error>({
    queryKey: ["/api/user"],
    queryFn: async () => {
      const res = await fetch("/api/user");
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch user");
      return res.json();
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      if (!res.ok) throw new Error("Invalid credentials");
      return res.json();
    },
    onSuccess: (user) => {
      localStorage.setItem('lastLoginMethod', 'email');
      // Wipe any cached data from a previously logged-in account before showing
      // this user's data, so one account can never see another's cached content.
      queryClient.clear();
      identify(String(user.id), { email: user.email });
      queryClient.setQueryData(["/api/user"], user);
      setLocation("/dashboard");
    },
    onError: (error: Error) => {
      // Toast removed for login/logout errors
      console.error(error);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        await signOut(auth);
        const res = await fetch("/api/logout", { method: "POST" });
        if (!res.ok) throw new Error("Logout failed");
      } catch (error) {
        console.error("Logout error:", error);
        throw error;
      }
    },
    onSuccess: () => {
      track(EventName.USER_LOGOUT, {});
      reset();
      // Clear all cached account data on logout so nothing leaks to the next user.
      queryClient.clear();
      queryClient.setQueryData(["/api/user"], null);
      setLocation("/auth");
    },
    onError: (error: Error) => {
      // Toast removed for login/logout errors
      console.error(error);
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (newUser: InsertUser) => {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
      return res.json();
    },
    onSuccess: (user) => {
      queryClient.clear();
      identify(String(user.id), { email: user.email });
      queryClient.setQueryData(["/api/user"], user);
      toast({ description: "Registered successfully" });
      setLocation("/onboarding");
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();
      const displayName = result.user.displayName || '';
      const [firstName = '', lastName = ''] = displayName.split(' ');

      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, firstName, lastName }),
      });

      if (!res.ok) throw new Error("Failed to authenticate with server");

      const user = await res.json();
      localStorage.setItem('lastLoginMethod', 'google');
      queryClient.clear();
      identify(String(user.id), { email: user.email });
      queryClient.setQueryData(["/api/user"], user);
      setLocation("/dashboard");
    } catch (error) {
      if ((error as any)?.code === 'auth/unauthorized-domain') {
        toast({
          title: "Domain Not Authorized",
          description: "This domain is not authorized for Google Sign-in. Please contact the administrator.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Google Sign-in failed",
          description: error instanceof Error ? error.message : "An error occurred",
          variant: "destructive",
        });
      }
    }
  };

  const signInWithMicrosoft = async () => {
    try {
      const result = await signInWithPopup(auth, microsoftProvider);
      const idToken = await result.user.getIdToken();
      const displayName = result.user.displayName || '';
      const [firstName = '', lastName = ''] = displayName.split(' ');

      const res = await fetch("/api/auth/microsoft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, firstName, lastName }),
      });

      if (!res.ok) throw new Error("Failed to authenticate with server");

      const user = await res.json();
      localStorage.setItem('lastLoginMethod', 'microsoft');
      queryClient.clear();
      identify(String(user.id), { email: user.email });
      queryClient.setQueryData(["/api/user"], user);
      setLocation("/dashboard");
    } catch (error) {
      if ((error as any)?.code === 'auth/unauthorized-domain') {
        toast({
          title: "Domain Not Authorized",
          description: "This domain is not authorized for Microsoft Sign-in. Please contact the administrator.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Microsoft Sign-in failed",
          description: error instanceof Error ? error.message : "An error occurred",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        firebaseUser,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
        signInWithGoogle,
        signInWithMicrosoft,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}