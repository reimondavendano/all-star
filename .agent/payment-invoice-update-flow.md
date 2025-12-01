# Payment Success Flow - Invoice Update Logic

## Overview
When a customer successfully pays through the portal, the system now automatically:
1. Records the payment in the `payments` table
2. Marks unpaid invoices as "Paid" in the `invoices` table
3. Updates the balance to ₱0 (since unpaid invoices are now paid)

## Payment Flow

### Step 1: Customer Initiates Payment
- Customer clicks "Pay Bill" on portal
- Sees payment modal with total amount (e.g., ₱1,299)
- Selects payment method (GCash, Maya, etc.)

### Step 2: PayMongo Processing
- Customer redirected to PayMongo checkout
- Customer authorizes payment
- Redirected back to `/payment/success`

### Step 3: Payment Finalization (Updated Logic)
```typescript
// 1. Create PayMongo payment
const paymentResponse = await axios.post('/api/paymongo/create-payment', {
    source_id: sourceId,
    amount: 1299,
    description: 'Subscription Payment'
});

// 2. Record payment in database
await supabase.from('payments').insert({
    subscription_id: subscriptionId,
    amount: 1299,
    mode: 'E-Wallet',
    settlement_date: '2025-12-01'
});

// 3. Get all unpaid invoices (ordered by due date)
const unpaidInvoices = await supabase
    .from('invoices')
    .select('*')
    .eq('subscription_id', subscriptionId)
    .in('payment_status', ['Unpaid', 'Partially Paid'])
    .order('due_date', { ascending: true });

// 4. Mark invoices as Paid
let remainingAmount = 1299;

for (const invoice of unpaidInvoices) {
    if (remainingAmount >= invoice.amount_due) {
        // Full payment
        await supabase
            .from('invoices')
            .update({ payment_status: 'Paid' })
            .eq('id', invoice.id);
        
        remainingAmount -= invoice.amount_due;
    } else if (remainingAmount > 0) {
        // Partial payment
        await supabase
            .from('invoices')
            .update({ payment_status: 'Partially Paid' })
            .eq('id', invoice.id);
        
        remainingAmount = 0;
    }
}
```

## Example Scenarios

### Scenario 1: Single Unpaid Invoice
**Before Payment:**
- Invoice 1: ₱1,299 (Status: Unpaid)
- Balance: ₱1,299

**Customer Pays:** ₱1,299

**After Payment:**
- Invoice 1: ₱1,299 (Status: **Paid**) ✅
- Balance: **₱0** ✅
- Payment Record: ₱1,299 (E-Wallet)

---

### Scenario 2: Multiple Unpaid Invoices
**Before Payment:**
- Invoice 1 (Dec 15): ₱1,299 (Status: Unpaid)
- Invoice 2 (Nov 15): ₱1,299 (Status: Unpaid)
- Balance: ₱2,598

**Customer Pays:** ₱1,299

**After Payment:**
- Invoice 1 (Nov 15): ₱1,299 (Status: **Paid**) ✅ (oldest paid first)
- Invoice 2 (Dec 15): ₱1,299 (Status: Unpaid)
- Balance: **₱1,299** ✅
- Payment Record: ₱1,299 (E-Wallet)

---

### Scenario 3: Overpayment
**Before Payment:**
- Invoice 1: ₱1,299 (Status: Unpaid)
- Balance: ₱1,299

**Customer Pays:** ₱2,000

**After Payment:**
- Invoice 1: ₱1,299 (Status: **Paid**) ✅
- Balance: **₱0** ✅ (no negative balance, excess ₱701 is recorded as payment)
- Payment Record: ₱2,000 (E-Wallet)

---

### Scenario 4: Partial Payment
**Before Payment:**
- Invoice 1: ₱1,299 (Status: Unpaid)
- Balance: ₱1,299

**Customer Pays:** ₱500

**After Payment:**
- Invoice 1: ₱1,299 (Status: **Partially Paid**) ✅
- Balance: **₱1,299** (still shows full amount, partial tracking is in payment_status)
- Payment Record: ₱500 (E-Wallet)

---

## Database Changes

### Payments Table
New record inserted:
```sql
INSERT INTO payments (
    subscription_id,
    amount,
    mode,
    notes,
    settlement_date
) VALUES (
    'sub-id-123',
    1299,
    'E-Wallet',
    'Online Payment via PayMongo (Ref: pay_xxx)',
    '2025-12-01'
);
```

### Invoices Table
Status updated:
```sql
UPDATE invoices 
SET payment_status = 'Paid'
WHERE id = 'invoice-id-123';
```

## Balance Calculation (After Payment)

The portal now calculates balance from **unpaid invoices only**:

```typescript
const unpaidInvoices = allInvoices.filter(
    inv => inv.payment_status === 'Unpaid' || inv.payment_status === 'Partially Paid'
);

const balance = unpaidInvoices.reduce((sum, inv) => sum + inv.amount_due, 0);
```

**Result:**
- If all invoices are paid → Balance = ₱0 ✅
- If some invoices are unpaid → Balance = sum of unpaid invoices ✅

## Testing the Flow

### Test Case 1: Pay Single Invoice
1. Navigate to portal with unpaid invoice (₱1,299)
2. Click "Pay Bill"
3. Select GCash
4. Authorize payment on PayMongo test page
5. **Verify:**
   - Payment success page shows "Payment successful!"
   - Return to portal → Balance shows ₱0
   - Invoice status changed to "Paid"
   - Payment record exists in database

### Test Case 2: Pay Multiple Invoices
1. Create 2 unpaid invoices (₱1,299 each)
2. Pay ₱1,299
3. **Verify:**
   - Oldest invoice marked as "Paid"
   - Newest invoice still "Unpaid"
   - Balance shows ₱1,299 (remaining)

## Files Modified
- `app/payment/success/page.tsx` - Payment finalization logic
- `app/(customer)/portal/[id]/page.tsx` - Balance calculation from unpaid invoices

## Related Documentation
- `balance-calculation-fix.md` - How balance is calculated
- `paymongo-integration-guide.md` - PayMongo setup
- `paymongo-testing-guide.md` - Testing instructions
