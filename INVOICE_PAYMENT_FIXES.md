# Invoice & Payment Fixes - January 28, 2025

## Issues Fixed

### 1. ✅ Decimal Places in Quick Collect & Invoices

**Problem:**
- Quick Collect was using `Math.round()` which removed decimal places
- Example: Invoice = ₱266.33, but displayed as ₱266
- This caused discrepancies between Total Billed and Collected amounts
- Partial payments couldn't show exact remaining balance (e.g., ₱265.33 showed as ₱265)

**Solution:**
Changed all amount displays from `Math.round(amount).toLocaleString()` to `amount.toFixed(2)`

**Files Modified:**
1. `components/admin/QuickCollectModal.tsx`
   - Line ~380: Total Amount display
   - Line ~390: Session Collected display
   - Line ~470: Page total display
   - Line ~530: Individual invoice amounts (both full and remaining balance)
   - Line ~620: Footer collected amount

2. `app/admin/invoices/page.tsx`
   - Line ~734: Invoice amount_due display
   - Line ~782: Payment amount display

**Impact:**
- ✅ All amounts now show exact values with 2 decimal places
- ✅ Quick Collect shows correct remaining balance (e.g., ₱265.33 instead of ₱265)
- ✅ Total Billed and Collected amounts now match exactly
- ✅ Prorated invoices (e.g., ₱266.33) display correctly

### 2. 📝 QR Code Update Instructions

**Current System:**
- QR codes are stored in Supabase Storage bucket: `allstar`
- Path: `payment-methods/{unit}-{provider}.jpg`
- Account details stored in: `payment-methods/accounts.json`

**To Update to Juls' QR Code:**

#### Option A: Via Admin Panel (Recommended)
1. Go to `/admin/verification`
2. Click "Settings" tab
3. Click "Upload Payment Method"
4. Select:
   - Business Unit: (e.g., Malanggam, Bulihan, Extension, or General)
   - Provider: GCash
   - Account Name: Juls [Full Name]
   - Account Number: [Juls' GCash Number]
   - Upload: [Juls' QR Code Image]
5. Click "Upload"

#### Option B: Direct Storage Update
1. Access Supabase Dashboard
2. Go to Storage → `allstar` bucket
3. Navigate to `payment-methods/` folder
4. Upload new QR code with naming convention:
   - For Malanggam: `malanggam-gcash.jpg`
   - For Bulihan: `bulihan-gcash.jpg`
   - For Extension: `extension-gcash.jpg`
   - For All Units: `general-gcash.jpg`
5. Update `accounts.json` with Juls' details:
```json
{
  "malanggam-gcash": {
    "accountName": "Juls [Full Name]",
    "accountNumber": "09XX-XXX-XXXX",
    "imageUrl": "https://[supabase-url]/storage/v1/object/public/allstar/payment-methods/malanggam-gcash.jpg",
    "updatedAt": "2025-01-28T00:00:00.000Z"
  }
}
```

**Files Involved:**
- `app/actions/verification.ts` - Upload/retrieve functions
- `components/customer/ManualPaymentModal.tsx` - Displays QR to customers
- `app/admin/verification/page.tsx` - Admin management interface

## Testing Checklist

### Decimal Places Fix
- [ ] Create invoice with decimal amount (e.g., ₱266.33)
- [ ] Make partial payment (e.g., ₱1.00 via GCash)
- [ ] Open Quick Collect modal
- [ ] Verify remaining balance shows ₱265.33 (not ₱265)
- [ ] Collect remaining balance via Quick Collect
- [ ] Verify Total Billed = Total Collected

### QR Code Update
- [ ] Upload Juls' QR code via admin panel
- [ ] Log in as customer
- [ ] Go to payment page
- [ ] Select GCash payment
- [ ] Verify Juls' QR code is displayed
- [ ] Verify account name shows "Juls [Name]"
- [ ] Verify account number is correct

## Database Impact

**No schema changes required** - All fixes are display-only changes. The database already stores exact decimal values correctly.

## Notes

- The `formatBalanceDisplay()` function in `lib/billing.ts` still rounds balances for display purposes (as per requirements)
- However, invoice amounts and payment amounts now preserve decimal precision
- This is correct because:
  - **Balances** = Running totals (can be rounded for display)
  - **Invoice/Payment Amounts** = Exact transaction values (must show decimals)

## Related Files

- `lib/billing.ts` - Billing calculations (already correct)
- `lib/invoiceService.ts` - Invoice generation (already correct)
- `components/admin/QuickCollectModal.tsx` - ✅ Fixed
- `app/admin/invoices/page.tsx` - ✅ Fixed
- `app/actions/verification.ts` - QR code management
- `components/customer/ManualPaymentModal.tsx` - Customer QR display

---

**Status:** ✅ All fixes applied and ready for testing
**Date:** January 28, 2025
**Implemented by:** Kiro AI Assistant
