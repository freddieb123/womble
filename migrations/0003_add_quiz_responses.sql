-- Drop existing table if it exists
DROP TABLE IF EXISTS quiz_responses;

-- Create quiz_responses table
CREATE TABLE IF NOT EXISTS quiz_responses (
  config_id integer NOT NULL REFERENCES chat_configs(id),
  session_id text NOT NULL,
  user_name text,
  feedback jsonb NOT NULL DEFAULT '{}',
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT quiz_responses_config_id_session_id_pk PRIMARY KEY (config_id, session_id)
);