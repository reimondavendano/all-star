-- Enable pgcrypto extension for password hashing (must be first)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create the user_role type (only if it doesn't exist)
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('super_admin', 'user_admin', 'collector');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create the user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name TEXT,
    role user_role DEFAULT 'user_admin',
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Insert the users with encrypted passwords
INSERT INTO user_profiles (email, password, full_name, role)
VALUES 
    ('allstaradmin@gmail.com', crypt('@dM!nAllst@R92543', gen_salt('bf')), 'Super Admin', 'super_admin'),
    ('user_admin@gmail.com', crypt('User!@AdM!n8721', gen_salt('bf')), 'User Admin', 'user_admin'),
    ('collector@gmail.com', crypt('collector@Allst@r', gen_salt('bf')), 'Collector', 'collector')
ON CONFLICT (email) DO UPDATE 
SET password = EXCLUDED.password,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;

-- Create a secure login function to verify credentials
CREATE OR REPLACE FUNCTION login_user(p_email TEXT, p_password TEXT)
RETURNS TABLE (
    id UUID,
    email VARCHAR,
    full_name TEXT,
    role user_role,
    avatar_url TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        up.id,
        up.email,
        up.full_name,
        up.role,
        up.avatar_url
    FROM user_profiles up
    WHERE up.email = p_email 
    AND up.password = crypt(p_password, up.password);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
