import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@db/schema";
import pkg from 'pg';
const { Pool } = pkg;

const connectionString = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('railway') || connectionString.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : false,
});

export const db = drizzle({ client: pool, schema });