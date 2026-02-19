# SMS and Payment Fixes - February 19, 2026

## Issues Fixed

### 1. SMS Not Showing Full Unpaid Balance

**Problem:**
When generating a third invoice with 3 unpaid invoices totaling ₱1,931, the SMS only showed ₱832 (the new invoice amount) instead of the total.

**Root Cause:**
The SMS was using `outstandingBalance` from the subscription's balance field, which might not accurately reflect ALL unpaid invoices. It was only passing the subscription's current balance, not querying actual unpaid invoices.

**Solution:**
Modified `invoiceService.ts` to query ALL unpaid invoices before sending SMS:
- Queries all invoices with status 'Unpaid' or 'Partially Paid'
- Calculates total unpaid amount: `(amount_due - amount_paid)` for each invoice
- Passes this accurate total to the SMS template

**Expected SMS Format:**
```
Hi [Customer Name]!

Your [Business Unit] internet bill is ready:
Amount: P832
Due Date: [Date]

⚠️ Outstanding Balance: P1,099
Total to Pay: P1,931

Please pay on time to avoid disconnection.
Thank you! - Allstar
```

Where:
- Amount: ₱832 (new invoice after discounts/credits)
- Outstanding Balance: ₱1,099 (₱999 + ₱100 from previous unpaid invoices)
- Total to Pay: ₱1,931 (₱832 + ₱1,099)

---

### 2. Referral Credit Payment Not Updating amount_paid

**Problem:**
Invoice showing `amount_paid = 532` when it should be `832` (₱532 cash + ₱300 referral credit). The referral credit payment exists in the payments table with the correct invoice_id, but wasn't being summed.

**Root Cause:**
The `amount_paid` field in the invoices table was not being updated when payments were made. The payment status calculation was working, but the amount_paid field was stale.

**Solution:**
1. **Fixed `paymentService.ts`** to update `amount_paid` when processing payments:
   - Queries all payments for the specific invoice (by both `invoice_id` AND `subscription_id`)
   - Calculates total paid amount including all payment modes (Cash, E-Wallet, Referral Credit)
   - Updates both `payment_status` AND `amount_paid` in the invoices table

2. **Created reconciliation script** (`20260219_fix_amount_paid_reconciliation.sql`):
   - Fixes existing invoices where `amount_paid` doesn't match actual payments
   - Updates payment status based on corrected amounts
   - Includes verification query to check for any remaining discrepancies

**How to Fix Existing Data:**
Run the reconciliation script:
```bash
psql -h [host] -U [user] -d [database] -f database/20260219_fix_amount_paid_reconciliation.sql
```

This will:
1. Update all invoices where `amount_paid` doesn't match the sum of payments
2. Correct payment statuses based on the updated amounts
3. Show any remaining discrepancies for manual review

---

## Files Modified

1. **all-star/lib/invoiceService.ts**
   - Added query for unpaid invoices before sending SMS
   - Calculates accurate total unpaid balance from database
   - Passes correct values to SMS template

2. **all-star/lib/paymentService.ts** (already fixed in previous session)
   - Updates `amount_paid` when processing payments
   - Queries payments by both `invoice_id` and `subscription_id`

3. **all-star/database/20260219_fix_amount_paid_reconciliation.sql** (new)
   - Reconciliation script to fix existing data
   - Updates amount_paid based on actual payments
   - Corrects payment statuses

---

## Testing Checklist

### SMS Balance Display
- [ ] Generate invoice for customer with no previous unpaid invoices
  - SMS should show only the new invoice amount
- [ ] Generate invoice for customer with 1 unpaid invoice
  - SMS should show new invoice + outstanding balance + total
- [ ] Generate invoice for customer with multiple unpaid invoices
  - SMS should show correct total of ALL unpaid invoices

### Payment Amount Tracking
- [ ] Make cash payment and verify `amount_paid` updates
- [ ] Make referral credit payment and verify it's included in `amount_paid`
- [ ] Make partial payment and verify status is "Partially Paid"
- [ ] Make full payment and verify status changes to "Paid"
- [ ] Run reconciliation script and verify no discrepancies remain

---

## Notes

- The SMS fix applies to both cron job automatic generation and manual generation via GenerateInvoiceModal
- The payment fix applies to all future payments; existing data needs the reconciliation script
- All amounts are rounded to whole numbers (no decimals)
- Payment status is now calculated based on actual payments in the database, not just subscription balance
