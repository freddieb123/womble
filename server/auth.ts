import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, insertUserSchema, type SelectUser } from "@db/schema";
import { db, pool } from "@db";
import { eq } from "drizzle-orm";
import { fromZodError } from "zod-validation-error";
import { z } from "zod";
import { sendEmail, generatePasswordResetEmail } from "./email";
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Validate Firebase Admin configuration
const requiredFirebaseEnvVars = {
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY,
};

// Check for missing environment variables
Object.entries(requiredFirebaseEnvVars).forEach(([key, value]) => {
  if (!value) {
    throw new Error(`Missing required Firebase Admin environment variable: ${key}`);
  }
});

// Initialize Firebase Admin with properly formatted private key
try {
  console.log("Initializing Firebase Admin with project ID:", process.env.VITE_FIREBASE_PROJECT_ID);

  // Format private key properly - replace escaped newlines and quotes
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ?.replace(/\\n/g, '\n')
    ?.replace(/\\/g, '')
    ?.replace(/^"(.*)"$/, '$1');

  if (!privateKey) {
    throw new Error("FIREBASE_PRIVATE_KEY environment variable is required");
  }

  // Validate private key format
  if (!privateKey.includes('BEGIN PRIVATE KEY') || !privateKey.includes('END PRIVATE KEY')) {
    console.error("Invalid private key format. Private key should contain BEGIN and END markers");
    throw new Error("Invalid private key format");
  }

  console.log("Private key validation passed, initializing Firebase Admin...");

  initializeApp({
    credential: cert({
      projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
  });

  console.log("Firebase Admin initialized successfully");
} catch (error) {
  console.error("Firebase Admin initialization error:", error);
  console.error("Firebase Admin initialization details:", {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKeyLength: process.env.FIREBASE_PRIVATE_KEY?.length,
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : String(error)
  });
  throw error;
}

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);
const PostgresSessionStore = connectPg(session);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

async function getUserByEmail(email: string) {
  return db.select().from(users).where(eq(users.email, email)).limit(1);
}

export function setupAuth(app: Express) {
  const store = new PostgresSessionStore({ pool, createTableIfMissing: true });
  const sessionSettings: session.SessionOptions = {
    secret: process.env.REPL_ID!,
    resave: false,
    saveUninitialized: false,
    store,
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy({
      usernameField: 'email',
      passwordField: 'password'
    }, async (email, password, done) => {
      try {
        const [user] = await getUserByEmail(email);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const result = insertUserSchema.safeParse(req.body);
      if (!result.success) {
        const error = fromZodError(result.error);
        return res.status(400).send(error.toString());
      }

      const [existingUser] = await getUserByEmail(result.data.email);
      if (existingUser) {
        return res.status(400).send("Email already exists");
      }

      const [user] = await db
        .insert(users)
        .values({
          ...result.data,
          password: await hashPassword(result.data.password),
        })
        .returning();

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/google", async (req, res) => {
    try {
      const { idToken, firstName, lastName } = req.body;
      console.log("Processing Google auth with token:", idToken?.substring(0, 10) + "...");
      console.log("Received name information:", { firstName, lastName });

      if (!idToken) {
        console.error("Google auth failed: No token provided");
        return res.status(400).json({ error: "No token provided" });
      }

      // Verify the ID token using Firebase Admin SDK
      console.log("Verifying token with Firebase Admin...");
      const decodedToken = await getAuth().verifyIdToken(idToken);
      console.log("Token verified successfully");

      const { email } = decodedToken;

      if (!email) {
        console.error("Google auth failed: No email in decoded token");
        return res.status(400).json({ error: "No email provided" });
      }

      console.log("Processing authentication for email:", email);

      // Check if user exists
      const [existingUser] = await getUserByEmail(email);
      console.log("User exists?", !!existingUser);

      let user;
      if (existingUser) {
        // Update existing user's name if provided
        [user] = await db
          .update(users)
          .set({
            firstName: firstName || existingUser.firstName,
            lastName: lastName || existingUser.lastName,
          })
          .where(eq(users.id, existingUser.id))
          .returning();
        console.log("Updated existing user account");
      } else {
        // Create new user
        console.log("Creating new user account with name:", { firstName, lastName });
        const randomPassword = randomBytes(16).toString('hex');
        [user] = await db
          .insert(users)
          .values({
            email,
            password: await hashPassword(randomPassword),
            firstName,
            lastName,
          })
          .returning();
        console.log("New user created successfully");
      }

      // Log the user in
      console.log("Logging in user...");
      req.login(user, (err) => {
        if (err) {
          console.error("Login error:", err);
          return res.status(500).json({ error: "Failed to login", details: err.message });
        }
        console.log("User logged in successfully");
        res.status(200).json(user);
      });
    } catch (error) {
      console.error("Google auth error:", error);
      console.error("Complete error details:", {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      res.status(401).json({ error: "Invalid token", details: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    res.status(200).json(req.user);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
}