import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "@db/schema";
import pkg from 'pg';
const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Create a PostgreSQL pool for session management
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle({
  connection: process.env.DATABASE_URL,
  schema,
  ws: ws,
});