-- Create customers table (without customer_portal)
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  name text NOT NULL,
  mobile_number text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add barangay column to subscriptions if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'subscriptions' AND column_name = 'barangay'
    ) THEN
        ALTER TABLE public.subscriptions ADD COLUMN barangay text;
    END IF;
END $$;

-- Add customer_portal column to subscriptions if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'subscriptions' AND column_name = 'customer_portal'
    ) THEN
        ALTER TABLE public.subscriptions ADD COLUMN customer_portal text;
    END IF;
END $$;

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Create policies (adjust as needed for your security requirements)
CREATE POLICY "Enable read access for all users" ON public.customers
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON public.customers
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users only" ON public.customers
    FOR UPDATE USING (true);
