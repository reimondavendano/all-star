-- Add 'collector' to the user_role enum (if it doesn't already exist)
-- Run this in your Supabase SQL Editor

-- First, check if 'collector' already exists in the enum
DO $$ 
BEGIN
    -- Try to add the collector value to the enum
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'collector';
EXCEPTION
    WHEN duplicate_object THEN 
        RAISE NOTICE 'collector role already exists';
END $$;

-- If you already have a collector user, you can update their role like this:
-- UPDATE public.profiles SET role = 'collector' WHERE id = 'your-user-id';

-- To verify the enum values:
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = 'user_role'::regtype;
