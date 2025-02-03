import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "practice-perfect.replit.app",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.appspot.com`,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

export async function handleGoogleRedirect() {
  try {
    console.log("Getting redirect result...");
    const result = await getRedirectResult(auth);
    console.log("Redirect result:", result ? "Success" : "No result");

    if (result) {
      console.log("User signed in, getting ID token...");
      const idToken = await result.user.getIdToken();

      console.log("Sending token to backend...");
      const response = await fetch('/api/auth/google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        throw new Error('Failed to authenticate with server');
      }

      return await response.json();
    }
  } catch (error) {
    console.error("Google redirect error:", error);
    throw error;
  }
}