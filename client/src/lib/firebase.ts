import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult } from "firebase/auth";

// Validate required environment variables
const requiredEnvVars = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Check if any required variables are missing
Object.entries(requiredEnvVars).forEach(([key, value]) => {
  if (!value) {
    throw new Error(`Missing required environment variable: VITE_FIREBASE_${key.toUpperCase()}`);
  }
});

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

// Validate project ID format (should not contain ':' which would indicate it's an app ID)
if (projectId.includes(':')) {
  throw new Error('Invalid project ID format. Make sure you are using the Firebase project ID, not the app ID.');
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: `${projectId}.firebaseapp.com`,
  projectId: projectId,
  storageBucket: `${projectId}.appspot.com`,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

console.log("Firebase Config:", {
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  // Logging partial API key for verification (first 6 chars)
  apiKeyPrefix: import.meta.env.VITE_FIREBASE_API_KEY?.substring(0, 6)
});

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Configure Google Provider
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export async function handleGoogleRedirect() {
  try {
    console.log("Getting redirect result... Current URL:", window.location.href);
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
    console.error("Google redirect error details:", {
      code: error instanceof Error ? (error as any).code : 'unknown',
      message: error instanceof Error ? error.message : String(error),
      location: window.location.href
    });
    throw error;
  }
}