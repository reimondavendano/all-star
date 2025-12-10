-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Enums
create type user_role as enum ('super_admin', 'user_admin', 'collector', 'customer');
create type prospect_status as enum ('Open', 'Closed Lost', 'Closed Won');
create type invoice_date_enum as enum ('15th', '30th');
create type payment_mode as enum ('Cash', 'E-Wallet');
create type expense_reason as enum ('Maintenance', 'Materials', 'Transportation', 'Others');
create type barangay_enum as enum ('Bulihan', 'San Agustin', 'San Gabriel', 'Liang', 'Catmon');
create type invoice_status as enum ('Paid', 'Unpaid', 'Partially Paid');

-- Business Units
create table public.business_units (
  id uuid not null default uuid_generate_v4() primary key,
  name text not null,
  subscribers integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Plans
create table public.plans (
  id uuid not null default uuid_generate_v4() primary key,
  name text not null,
  monthly_fee numeric not null,
  details text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Customers
create table public.customers (
  id uuid not null default uuid_generate_v4() primary key,
  name text not null,
  mobile_number text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Profiles (for Auth/Roles)
create table public.profiles (
  id uuid not null references auth.users on delete cascade primary key,
  role user_role not null default 'customer',
  business_unit_id uuid references public.business_units(id), -- For User Admin
  customer_id uuid references public.customers(id), -- For Customer
  full_name text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Prospects
create table public.prospects (
  id uuid not null default uuid_generate_v4() primary key,
  name text not null,
  plan_id uuid references public.plans(id),
  business_unit_id uuid references public.business_units(id),
  landmark text,
  barangay text,
  address text,
  label text,
  x-coordinates numeric,
  y-coordinates numeric,
  mobile_number text,
  installation_date date,
  referrer_id uuid references public.customers(id),
  details text,
  router_serial_number text,
  status prospect_status default 'Open',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Subscriptions
create table public.subscriptions (
  id uuid not null default uuid_generate_v4() primary key,
  subscriber_id uuid not null references public.customers(id),
  business_unit_id uuid not null references public.business_units(id),
  plan_id uuid not null references public.plans(id),
  router_serial_number text,
  active boolean default true,
  date_installed date,
  contact_person text,
  label text,
  address text,
  barangay text,  
  landmark text,
  x-coordinates numeric,
  y-coordinates numeric,
  invoice_date invoice_date_enum,
  customer_portal text,
  referral_credit_applied boolean default false,
  balance numeric default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Invoices
create table public.invoices (
  id uuid not null default uuid_generate_v4() primary key,
  subscription_id uuid not null references public.subscriptions(id),
  from_date date,
  to_date date,
  due_date date,
  amount_due numeric not null,
  payment_status invoice_status default 'Unpaid',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Payments
create table public.payments (
  id uuid not null default uuid_generate_v4() primary key,
  subscription_id uuid not null references public.subscriptions(id),
  settlement_date date,
  amount numeric not null,
  mode payment_mode not null,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Expenses
create table public.expenses (
  id uuid not null default uuid_generate_v4() primary key,
  subscription_id uuid references public.subscriptions(id),
  date date,
  quantity numeric default 1,
  amount numeric not null,
  reason expense_reason not null,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- PPP Service Type Enum
create type ppp_service_type as enum ('any', 'async', 'l2tp', 'ovpn', 'pppoe', 'pptp', 'sstp');

-- MikroTik PPP Secrets (synced from router)
create table public.mikrotik_ppp_secrets (
  id uuid not null default uuid_generate_v4() primary key,
  mikrotik_id text unique,                                       -- The .id from MikroTik API (e.g., "*1A")
  customer_id uuid references public.customers(id),              -- Link to customer
  subscription_id uuid references public.subscriptions(id),      -- Link to local subscription
  name text not null unique,                                     -- Username in MikroTik (e.g., "PROMISEDELEON")
  password text,                                                 -- Password (may be hidden/not synced from router)
  service ppp_service_type default 'any',                        -- Service type (any, pppoe, pptp, etc.)
  profile text default 'default',                                -- MikroTik PPP Profile name
  local_address text,                                            -- Local IP assigned
  remote_address text,                                           -- Remote IP (for tunnels)
  caller_id text,                                                -- MAC or Caller-ID restriction
  enabled boolean default true,                                  -- Is the secret enabled on the router
  disabled boolean default false,                                -- Is the secret disabled (inverse of enabled, for MikroTik sync)
  comment text,                                                  -- Optional comment
  last_synced_at timestamp with time zone,                       -- Last time this was synced from/to MikroTik
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for MikroTik PPP Secrets
alter table public.mikrotik_ppp_secrets enable row level security;

-- Views for Computed Columns

-- Customer Status View
create or replace view public.customer_status_view as
select 
  c.id as customer_id,
  c.name,
  case 
    when exists (
      select 1 from public.subscriptions s 
      where s.subscriber_id = c.id and s.active = true
    ) then 'Active'
    else 'Inactive'
  end as status
from public.customers c;

-- Business Unit Active Subscriptions View
create or replace view public.business_unit_stats_view as
select 
  bu.id as business_unit_id,
  bu.name,
  count(s.id) filter (where s.active = true) as active_subscriptions
from public.business_units bu
left join public.subscriptions s on s.business_unit_id = bu.id
group by bu.id, bu.name;

-- Subscription Balance View
create or replace view public.subscription_balance_view as
select 
  s.id as subscription_id,
  coalesce((select sum(amount_due) from public.invoices where subscription_id = s.id), 0) -
  coalesce((select sum(amount) from public.payments where subscription_id = s.id), 0) as balance
from public.subscriptions s;


-- RLS Policies (Basic Templates)

alter table public.profiles enable row level security;
alter table public.business_units enable row level security;
alter table public.plans enable row level security;
alter table public.customers enable row level security;
alter table public.prospects enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;

-- Super Admin can do everything
create policy "Super Admin full access" on public.profiles
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
  );

-- User Admin access (example for Business Units - read only or specific logic)
-- This is a simplified policy. In production, you'd check the user's assigned business_unit_id.

-- Customer access (example for Portal)
create policy "Customers can view own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Customers can view own subscription" on public.subscriptions
  for select using (
    exists (
      select 1 from public.profiles 
      where id = auth.uid() 
      and customer_id = subscriptions.subscriber_id
    )
  );

-- Policies for Mikrotik PPP Secrets
create policy "Admins can manage ppp secrets" on public.mikrotik_ppp_secrets
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin', 'user_admin'))
  );

create policy "Customers can view own ppp secret" on public.mikrotik_ppp_secrets
  for select using (
    exists (
      select 1 from public.profiles 
      where id = auth.uid() 
      and customer_id = mikrotik_ppp_secrets.customer_id
    )
  );

