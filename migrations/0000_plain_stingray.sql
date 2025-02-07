CREATE TABLE IF NOT EXISTS "chat_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text DEFAULT 'chat' NOT NULL,
	"title" text NOT NULL,
	"system_prompt" text NOT NULL,
	"user_instructions" text,
	"feedback_criteria" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"is_template" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"config_id" integer NOT NULL,
	"session_id" text NOT NULL,
	"user_name" text,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"feedback" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_config_id_session_id_pk" PRIMARY KEY("config_id","session_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "uploads" (
	"config_id" integer NOT NULL,
	"session_id" text NOT NULL,
	"user_name" text,
	"file_name" text NOT NULL,
	"feedback" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uploads_config_id_session_id_pk" PRIMARY KEY("config_id","session_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_configs" ADD CONSTRAINT "chat_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_config_id_chat_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."chat_configs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "uploads" ADD CONSTRAINT "uploads_config_id_chat_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."chat_configs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
