import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import { signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import type { SelectUser, InsertUser } from "@db/schema";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { auth, googleProvider } from "@/lib/firebase";

type AuthContextType = {
  user: SelectUser | null;
  firebaseUser: User | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, InsertUser>;
  signInWithGoogle: () => Promise<void>;
};

type LoginData = Pick<InsertUser, "username" | "password">;

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);

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
      queryClient.setQueryData(["/api/user"], user);
      toast({
        description: "Logged in successfully",
      });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
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
      queryClient.setQueryData(["/api/user"], null);
      setLocation("/auth");
      toast({
        description: "Logged out successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
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
      queryClient.setQueryData(["/api/user"], user);
      toast({
        description: "Registered successfully",
      });
      setLocation("/");
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
      console.log("Starting Google sign-in process...");

      // Check if we're on an authorized domain
      const currentDomain = window.location.hostname;
      console.log("Current domain:", currentDomain);

      const result = await signInWithPopup(auth, googleProvider);
      console.log("Google sign-in successful, getting ID token...");
      const idToken = await result.user.getIdToken();

      // Extract first name and last name from display name
      const displayName = result.user.displayName || '';
      const [firstName = '', lastName = ''] = displayName.split(' ');

      console.log("Sending token and user info to backend...");
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, firstName, lastName }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Backend authentication failed:", errorText);
        throw new Error("Failed to authenticate with server");
      }

      const user = await res.json();
      console.log("Backend authentication successful");
      queryClient.setQueryData(["/api/user"], user);
      toast({
        description: "Signed in with Google successfully",
      });
      setLocation("/");
    } catch (error) {
      console.error("Google sign-in error:", {
        code: error instanceof Error ? (error as any).code : 'unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        domain: window.location.hostname
      });

      // Check if it's a domain-related error
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