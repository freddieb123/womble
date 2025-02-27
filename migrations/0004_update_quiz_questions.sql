
-- Rename expectedAnswer column to howToAssess in quiz_questions table
ALTER TABLE quiz_questions 
RENAME COLUMN expected_answer TO how_to_assess;
