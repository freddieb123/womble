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

// Validate app ID format (should contain two colons)
const appId = import.meta.env.VITE_FIREBASE_APP_ID;
if (!appId.includes(':') || appId.split(':').length !== 3) {
  console.warn('Warning: Firebase App ID format looks incorrect. Expected format: "1:123456789:web:abcdef"');
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: `${projectId}.firebaseapp.com`,
  projectId: projectId,
  storageBucket: `${projectId}.appspot.com`,
  appId: appId,
  measurementId: `G-${appId.split(':')[1]}`
};

// Log configuration and domain information for debugging
console.log("Firebase Config:", {
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  // Logging partial API key for verification (first 6 chars)
  apiKeyPrefix: import.meta.env.VITE_FIREBASE_API_KEY?.substring(0, 6)
});

// Log current domain information for authorized domains configuration
console.log("Current application domain:", window.location.hostname);
console.log("Full origin URL:", window.location.origin);

// Production domain
const PRODUCTION_DOMAIN = "practice-perfect.replit.app";

// Verify if current domain is in the expected list
const isValidDomain = window.location.hostname === PRODUCTION_DOMAIN || 
                     window.location.hostname.endsWith('.replit.dev');

if (!isValidDomain) {
  console.warn('Warning: Current domain is not in the expected list of authorized domains.');
  console.warn('Make sure to add this domain to Firebase Console -> Authentication -> Settings -> Authorized domains');
}

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
      console.log("Got ID token, length:", idToken.length);

      console.log("Sending token to backend...");
      const response = await fetch('/api/auth/google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken }),
      });

      console.log("Backend response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Backend error:", errorText);
        throw new Error(`Failed to authenticate with server: ${errorText}`);
      }

      const userData = await response.json();
      console.log("Authentication successful, user data received");
      return userData;
    } else {
      console.log("No redirect result - this is normal if not redirecting from Google");
      return null;
    }
  } catch (error) {
    console.error("Google redirect error details:", {
      code: error instanceof Error ? (error as any).code : 'unknown',
      message: error instanceof Error ? error.message : String(error),
      location: window.location.href,
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}