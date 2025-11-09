-- Add user_feedback column to query_logs table
ALTER TABLE query_logs 
ADD COLUMN IF NOT EXISTS user_feedback SMALLINT;

-- Add comment to document the column
COMMENT ON COLUMN query_logs.user_feedback IS 'User feedback: 1 for positive (thumbs up), -1 for negative (thumbs down), NULL for no feedback';

-- Optional: Add a check constraint to ensure only valid values
ALTER TABLE query_logs 
ADD CONSTRAINT check_user_feedback 
CHECK (user_feedback IN (-1, 1) OR user_feedback IS NULL);

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'query_logs' 
AND column_name = 'user_feedback';
