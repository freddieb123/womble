-- Add deleted and deleted_at columns to quiz_questions table
ALTER TABLE quiz_questions 
ADD COLUMN IF NOT EXISTS deleted boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS deleted_at timestamp;
