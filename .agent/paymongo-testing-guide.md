# PayMongo Sandbox Testing Guide

## Quick Start

### 1. Update Environment Variables
Replace the placeholder keys in `.env.local` with your actual PayMongo test keys:

```env
NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY=pk_test_YOUR_ACTUAL_KEY_HERE
PAYMONGO_SECRET_KEY=sk_test_YOUR_ACTUAL_KEY_HERE
PAYMONGO_API_URL=https://api.paymongo.com/v1
```

### 2. Get Your Test Keys
1. Go to https://dashboard.paymongo.com/
2. Toggle **"View Test Data"** (top right corner)
3. Navigate to **Developers** → **API Keys**
4. Copy both keys and update `.env.local`
5. Restart your dev server: `npm run dev`

### 3. Test Payment Flow

#### Option A: Test with Existing Customer
1. Go to http://localhost:3000/admin/customers
2. Click on any customer to view their details
3. Copy the customer ID from the URL
4. Navigate to: http://localhost:3000/portal/[paste-customer-id-here]
5. Click **"Pay Bill"** or **"Pay All Bills"**
6. Select a payment method (GCash recommended for testing)
7. On the PayMongo test page, click **"Authorize Test Payment"**
8. Verify the payment was recorded in Supabase

#### Option B: Quick Test URL
If you have a customer with ID `abc123`:
```
http://localhost:3000/portal/abc123
```

### 4. Verify Success
After completing a test payment:

**Check in Supabase:**
1. Open your Supabase dashboard
2. Go to **Table Editor** → **payments**
3. You should see a new record with:
   - `subscription_id`: The subscription that was paid
   - `amount`: The payment amount
   - `reference_number`: PayMongo payment ID (starts with `pay_`)
   - `payment_date`: Current timestamp

**Check Balance Update:**
1. Go to **subscriptions** table
2. Find the subscription that was paid
3. The `balance` should be reduced by the payment amount

### 5. Supported Payment Methods in Sandbox

| Method | Type | Test Behavior |
|--------|------|---------------|
| GCash | E-Wallet | Click "Authorize" to succeed |
| Maya (PayMaya) | E-Wallet | Click "Authorize" to succeed |
| GrabPay | E-Wallet | Click "Authorize" to succeed |
| BPI Online | Bank | Click "Authorize" to succeed |
| UnionBank | Bank | Click "Authorize" to succeed |

### 6. Test Scenarios

#### Successful Payment
1. Select any payment method
2. Click **"Authorize Test Payment"** on PayMongo page
3. Should redirect to `/payment/success`
4. Payment recorded in database
5. Balance updated

#### Failed Payment
1. Select any payment method
2. Click **"Fail Test Payment"** on PayMongo page (if available)
3. Should redirect back to portal
4. No payment recorded
5. Balance unchanged

### 7. Troubleshooting

**Error: "Server configuration error: Missing PayMongo keys"**
- Solution: Update your `.env.local` with actual keys and restart server

**Error: "Payment initialization failed"**
- Check browser console for detailed error
- Verify API keys are correct
- Ensure you're using test keys (start with `pk_test_` and `sk_test_`)

**Payment not recorded in database**
- Check browser console on `/payment/success` page
- Verify Supabase connection is working
- Check that `payments` table exists and has correct columns

**Redirect loop or stuck on processing**
- Clear browser sessionStorage: `sessionStorage.clear()`
- Try in incognito/private window
- Check that redirect URLs are correct

### 8. Production Checklist

Before going live:
- [ ] Replace test keys with live keys (`pk_live_...` and `sk_live_...`)
- [ ] Set up webhooks for reliable payment confirmation
- [ ] Test with real small amounts (₱1-10)
- [ ] Implement proper error logging
- [ ] Add email notifications for successful payments
- [ ] Set up payment reconciliation process

### 9. Useful Links

- PayMongo Dashboard: https://dashboard.paymongo.com/
- PayMongo API Docs: https://developers.paymongo.com/docs
- Test Cards: https://developers.paymongo.com/docs/testing
- Support: support@paymongo.com

---

## Quick Reference: Payment Flow

```
Portal → Pay Button → Modal → Select Method
    ↓
Create Source (API call)
    ↓
Redirect to PayMongo
    ↓
User Authorizes
    ↓
Redirect to /payment/success
    ↓
Create Payment (API call)
    ↓
Record in Database
    ↓
Update Balance
    ↓
Show Success → Back to Portal
```

## Need Help?

If you encounter issues:
1. Check the browser console for errors
2. Check the terminal/server logs
3. Verify all environment variables are set
4. Ensure Supabase tables have correct structure
5. Test with a fresh incognito window
