# Balance Calculation Fix

## Issue
The customer portal was showing ₱0 balance even though there was an unpaid invoice for ₱1,299.

## Root Cause
The portal was using the `subscription_balance_view` database view, which calculates balance as:
```sql
sum(ALL invoices.amount_due) - sum(payments.amount)
```

This approach has a flaw: it includes **all invoices** (both paid and unpaid) in the calculation. When an invoice is marked as "Paid", its `amount_due` is still counted in the sum, leading to incorrect balance calculations.

## Solution
Updated the portal page (`app/(customer)/portal/[id]/page.tsx`) to:

1. **Fetch all invoices** for each subscription
2. **Filter for unpaid invoices only** (status = 'Unpaid' or 'Partially Paid')
3. **Sum only the unpaid invoices** to get the correct balance

### Code Changes
```typescript
// OLD: Using database view (incorrect)
const { data: balanceData } = await supabase
    .from('subscription_balance_view')
    .select('balance')
    .eq('subscription_id', sub.id)
    .single();

const balance = balanceData?.balance || 0;

// NEW: Calculate from unpaid invoices only (correct)
const { data: allInvoices } = await supabase
    .from('invoices')
    .select('*')
    .eq('subscription_id', sub.id)
    .order('created_at', { ascending: false });

const unpaidInvoices = (allInvoices || []).filter(
    (inv: any) => inv.payment_status === 'Unpaid' || inv.payment_status === 'Partially Paid'
);

const balance = unpaidInvoices.reduce((sum: number, inv: any) => {
    return sum + (Number(inv.amount_due) || 0);
}, 0);
```

## How It Works Now

### Scenario 1: Customer has unpaid invoice
- Invoice: ₱1,299 (Status: Unpaid)
- **Balance shown: ₱1,299** ✅

### Scenario 2: Customer paid the invoice
- Invoice: ₱1,299 (Status: Paid)
- **Balance shown: ₱0** ✅

### Scenario 3: Customer has multiple invoices
- Invoice 1: ₱1,299 (Status: Paid)
- Invoice 2: ₱1,299 (Status: Unpaid)
- Invoice 3: ₱1,299 (Status: Unpaid)
- **Balance shown: ₱2,598** (only unpaid invoices) ✅

### Scenario 4: Partially paid invoice
- Invoice: ₱1,299 (Status: Partially Paid)
- **Balance shown: ₱1,299** (full amount, partial payment tracking is separate)

## Invoice Payment Status Flow

The `payment_status` field in the `invoices` table is managed by the admin when recording payments:

1. **Invoice Created**: Status = 'Unpaid'
2. **Payment Recorded** (via RecordPaymentModal):
   - If payment amount >= invoice amount_due: Status = 'Paid'
   - If payment amount < invoice amount_due: Status = 'Partially Paid'
   - If payment amount > invoice amount_due: Excess goes to subscription balance

## Testing
To verify the fix:
1. Navigate to customer portal: `http://localhost:3000/portal/[customer-id]`
2. Check that "Current Balance" matches the sum of unpaid invoices
3. Check that "Total Amount" (all subscriptions) is correct
4. Verify payment modal shows the correct amount

## Related Files
- `app/(customer)/portal/[id]/page.tsx` - Portal page (FIXED)
- `database/schema.sql` - Database schema (view definition)
- `app/admin/payments/page.tsx` - Admin payments page (reference for payment logic)
- `components/admin/RecordPaymentModal.tsx` - Payment recording logic

## Note on Database View
The `subscription_balance_view` is still in the database but is no longer used by the customer portal. It may still be used by admin pages. Consider updating the view definition to only include unpaid invoices:

```sql
-- Suggested update (not yet applied)
create or replace view public.subscription_balance_view as
select 
  s.id as subscription_id,
  coalesce(
    (select sum(amount_due) 
     from public.invoices 
     where subscription_id = s.id 
     AND payment_status IN ('Unpaid', 'Partially Paid')
    ), 0
  ) as balance
from public.subscriptions s;
```

This would make the view consistent with the portal logic.
