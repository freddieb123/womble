# Womble Project Guidelines

## Branching and deployment

There are two branches:
- `staging` — default target for all pushes. Deploys to the staging Railway environment.
- `main` — production. Only merge here when the user explicitly says "merge to production" or similar.

When the user says "push to GitHub" (or similar):
1. Ask the user to confirm the app is working locally first
2. Commit changes and push to `staging` (not `main`)
3. Never push directly to `main`

When the user says "merge to production":
1. Run: `git checkout main && git merge staging && git push && git checkout staging`
2. Confirm the merge is done and remind them Railway will auto-deploy to production

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
- Do not change any AI model identifier in the code (e.g. `whisper-1`, `gpt-4o`, `gpt-realtime-1.5`, `gemini-3.1-flash-live-preview`, etc.) without the user explicitly asking for it. Changing a model name can silently break features. If a task seems to require a model change, check with the user first.
