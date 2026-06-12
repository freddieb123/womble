# Womble Project Guidelines

## Before pushing to GitHub

Always verify the app works locally before pushing. Specifically:

1. Run `npm run dev` and confirm the server starts without errors
2. Open `http://localhost:5000` in a browser and check the app loads
3. If database changes are involved, confirm migrations run cleanly

Never push directly to `main` without completing these checks. Ask the user to confirm the app is working locally first.

## Environment

- Local dev uses `.env` for environment variables (never commit this file)
- Production runs on Railway — env vars are set in the Railway dashboard
- Database is hosted on Railway (PostgreSQL)

## Database

- Schema is defined in `db/schema.ts`
- To update the schema locally: `npx drizzle-kit push`
- To generate migrations: `npx drizzle-kit generate`
- Import scripts are in `scripts/` — do not commit the `old_data/` folder

## Key things to avoid

- Do not commit `.env`, `old_data/`, `uploads/`, or `scripts/` (all in `.gitignore`)
- Do not hardcode port 5000 — always use `process.env.PORT || "5000"`
- Do not use `process.env.REPL_ID` or other Replit-specific variables
