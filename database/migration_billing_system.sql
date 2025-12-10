-- =====================================================
-- SIMPLIFIED BILLING MIGRATION
-- Creates views for invoice and payment reporting
-- No extra logging tables (as per client request)
-- =====================================================

-- =====================================================
-- PART 1: Add missing columns to existing tables
-- =====================================================

-- Add invoice_id to payments (for linking payments to specific invoices)
ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id);

-- Add referrer_id to subscriptions (for tracking who referred the customer)
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS referrer_id uuid REFERENCES public.customers(id);

-- =====================================================
-- PART 2: Create comprehensive views for reporting
-- =====================================================

-- View: Invoice Detail with Customer and Subscription info
CREATE OR REPLACE VIEW public.invoice_detail_view AS
SELECT 
    i.id AS invoice_id,
    i.subscription_id,
    i.from_date,
    i.to_date,
    i.due_date,
    i.amount_due,
    i.payment_status,
    i.created_at AS invoice_created_at,
    -- Subscription info
    s.id AS subscription_id_ref,
    s.subscriber_id AS customer_id,
    s.plan_id,
    s.business_unit_id,
    s.balance AS subscription_balance,
    s.active AS subscription_active,
    s.date_installed,
    s.label AS subscription_label,
    s.address AS subscription_address,
    -- Customer info
    c.name AS customer_name,
    c.mobile_number AS customer_mobile,
    -- Plan info
    p.name AS plan_name,
    p.monthly_fee AS plan_monthly_fee,
    -- Business Unit info
    bu.name AS business_unit_name,
    -- Calculated fields
    COALESCE(
        (SELECT SUM(pay.amount) 
         FROM public.payments pay 
         WHERE pay.subscription_id = s.id 
         AND pay.settlement_date >= i.from_date 
         AND pay.settlement_date <= i.to_date), 
        0
    ) AS total_paid_this_period,
    -- PPP Secret name (if exists)
    COALESCE(
        (SELECT ppp.name 
         FROM public.mikrotik_ppp_secrets ppp 
         WHERE ppp.subscription_id = s.id 
         LIMIT 1), 
        NULL
    ) AS ppp_secret_name
FROM public.invoices i
INNER JOIN public.subscriptions s ON s.id = i.subscription_id
INNER JOIN public.customers c ON c.id = s.subscriber_id
INNER JOIN public.plans p ON p.id = s.plan_id
INNER JOIN public.business_units bu ON bu.id = s.business_unit_id;

-- View: Payment Detail with Customer and Subscription info
CREATE OR REPLACE VIEW public.payment_detail_view AS
SELECT 
    pay.id AS payment_id,
    pay.subscription_id,
    pay.invoice_id,
    pay.settlement_date,
    pay.amount,
    pay.mode,
    pay.notes,
    pay.created_at AS payment_created_at,
    -- Subscription info
    s.subscriber_id AS customer_id,
    s.plan_id,
    s.business_unit_id,
    s.balance AS subscription_balance,
    s.label AS subscription_label,
    -- Customer info
    c.name AS customer_name,
    c.mobile_number AS customer_mobile,
    -- Plan info
    p.name AS plan_name,
    p.monthly_fee AS plan_monthly_fee,
    -- Business Unit info
    bu.name AS business_unit_name,
    -- Invoice info (if linked)
    i.due_date AS invoice_due_date,
    i.amount_due AS invoice_amount_due,
    i.payment_status AS invoice_status,
    -- PPP Secret name (if exists)
    COALESCE(
        (SELECT ppp.name 
         FROM public.mikrotik_ppp_secrets ppp 
         WHERE ppp.subscription_id = s.id 
         LIMIT 1), 
        NULL
    ) AS ppp_secret_name
FROM public.payments pay
INNER JOIN public.subscriptions s ON s.id = pay.subscription_id
INNER JOIN public.customers c ON c.id = s.subscriber_id
INNER JOIN public.plans p ON p.id = s.plan_id
INNER JOIN public.business_units bu ON bu.id = s.business_unit_id
LEFT JOIN public.invoices i ON i.id = pay.invoice_id;

-- View: Customer Billing Summary (for dashboard/reports)
CREATE OR REPLACE VIEW public.customer_billing_summary_view AS
SELECT 
    c.id AS customer_id,
    c.name AS customer_name,
    c.mobile_number AS customer_mobile,
    s.id AS subscription_id,
    s.business_unit_id,
    bu.name AS business_unit_name,
    p.name AS plan_name,
    p.monthly_fee,
    s.balance AS current_balance,
    s.active AS is_active,
    s.date_installed,
    -- Total invoiced for this subscription
    COALESCE(
        (SELECT SUM(amount_due) FROM public.invoices WHERE subscription_id = s.id), 
        0
    ) AS total_invoiced,
    -- Total paid for this subscription
    COALESCE(
        (SELECT SUM(amount) FROM public.payments WHERE subscription_id = s.id), 
        0
    ) AS total_paid,
    -- Count of unpaid invoices
    COALESCE(
        (SELECT COUNT(*) FROM public.invoices 
         WHERE subscription_id = s.id AND payment_status = 'Unpaid'), 
        0
    ) AS unpaid_invoice_count,
    -- Most recent invoice date
    (SELECT MAX(due_date) FROM public.invoices WHERE subscription_id = s.id) AS last_invoice_date,
    -- Most recent payment date
    (SELECT MAX(settlement_date) FROM public.payments WHERE subscription_id = s.id) AS last_payment_date,
    -- PPP Secret name
    COALESCE(
        (SELECT ppp.name 
         FROM public.mikrotik_ppp_secrets ppp 
         WHERE ppp.subscription_id = s.id 
         LIMIT 1), 
        NULL
    ) AS ppp_secret_name
FROM public.customers c
INNER JOIN public.subscriptions s ON s.subscriber_id = c.id
INNER JOIN public.business_units bu ON bu.id = s.business_unit_id
INNER JOIN public.plans p ON p.id = s.plan_id;

-- View: Monthly Billing Report
CREATE OR REPLACE VIEW public.monthly_billing_report_view AS
SELECT 
    bu.id AS business_unit_id,
    bu.name AS business_unit_name,
    DATE_TRUNC('month', i.due_date) AS billing_month,
    COUNT(DISTINCT i.id) AS total_invoices,
    SUM(i.amount_due) AS total_billed,
    SUM(CASE WHEN i.payment_status = 'Paid' THEN i.amount_due ELSE 0 END) AS total_collected,
    SUM(CASE WHEN i.payment_status IN ('Unpaid', 'Partially Paid') THEN i.amount_due ELSE 0 END) AS total_outstanding,
    COUNT(CASE WHEN i.payment_status = 'Paid' THEN 1 END) AS paid_count,
    COUNT(CASE WHEN i.payment_status = 'Unpaid' THEN 1 END) AS unpaid_count,
    COUNT(CASE WHEN i.payment_status = 'Partially Paid' THEN 1 END) AS partial_count
FROM public.invoices i
INNER JOIN public.subscriptions s ON s.id = i.subscription_id
INNER JOIN public.business_units bu ON bu.id = s.business_unit_id
GROUP BY bu.id, bu.name, DATE_TRUNC('month', i.due_date);

-- =====================================================
-- PART 3: Create index for better query performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON public.invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription_id ON public.invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON public.payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_settlement_date ON public.payments(settlement_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_business_unit_id ON public.subscriptions(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_subscriber_id ON public.subscriptions(subscriber_id);

-- =====================================================
-- DONE!
-- 
-- Views created:
-- 1. invoice_detail_view - Invoice with customer, subscription, plan info
-- 2. payment_detail_view - Payment with customer, subscription, invoice info
-- 3. customer_billing_summary_view - Summary of customer billing status
-- 4. monthly_billing_report_view - Monthly aggregated billing report
-- =====================================================
