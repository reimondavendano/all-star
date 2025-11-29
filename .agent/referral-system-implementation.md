# Referral System Implementation Summary

## Overview
Implemented a complete referral system that allows customers to share ALLSTAR on Facebook and earn ₱300 credit when their referrals subscribe.

## Features Implemented

### 1. Customer Portal - "Refer a Friend" Button
**File**: `app/(customer)/portal/[id]/page.tsx`

- Added "Refer a Friend" button in the customer dashboard header (next to "Pay All Bills")
- Share modal with two options:
  - **Share to Facebook**: Opens Facebook share dialog with referral link
  - **Copy Referral Link**: Copies link to clipboard
- Referral link format:
  - Production: `https://all-star-three.vercel.app/ref/{customer_id}`
  - Local: `http://localhost:3000/ref/{customer_id}`
- Uses the customer ID from the URL params (`/portal/[id]`)

### 2. Referral Link Handler
**File**: `app/ref/[id]/page.tsx`

- Captures the referrer's customer ID from the URL
- Stores it in `sessionStorage` as `referrer_id`
- Redirects user to the home page

### 3. Auto-populate Referrer in Subscribe Form
**File**: `components/SubscribeModal.tsx`

**Changes made**:
- Added `useEffect` hook to check `sessionStorage` for `referrer_id` when modal opens
- Auto-populates the `referrerId` field if found in session
- Fetches and displays the referrer's name automatically
- Clears `sessionStorage` after successful prospect submission

**New function added**:
```typescript
const fetchReferrerName = async (customerId: string) => {
    // Fetches customer name from database
    // Sets referrerName state for display
}
```

### 4. Referral Credit Application (Already Implemented)
**File**: `components/admin/EditProspectModal.tsx`

The referral credit logic was already in place:
- When admin verifies a prospect (converts to customer/subscription)
- If `referrer_id` exists:
  1. Finds the referrer's subscription (latest one)
  2. Creates a payment record: ₱300 with mode "Referral Credit"
  3. Updates referrer's subscription balance: `balance - 300` (gives credit)
  4. Sets `referral_credit_applied: true`

## User Flow

1. **Customer shares link**:
   - Customer visits their portal at `/portal/{their_customer_id}`
   - Clicks "Refer a Friend" button
   - Shares to Facebook or copies link
   - Link contains their customer ID: `/ref/{customer_id}`

2. **Friend clicks link**:
   - Redirected to `/ref/{customer_id}`
   - Customer ID stored in sessionStorage
   - Redirected to home page

3. **Friend subscribes**:
   - Clicks "Subscribe Now" button on home page
   - Subscribe modal opens
   - Referrer field auto-populated from session
   - Referrer name displayed automatically
   - Submits prospect form
   - SessionStorage cleared after submission

4. **Admin verifies prospect**:
   - Admin opens EditProspectModal
   - Clicks "Approve" to convert to customer
   - System automatically:
     - Creates customer & subscription
     - Applies ₱300 credit to referrer's balance
     - Creates payment record
     - Deletes prospect

## Technical Details

### Session Storage
- **Key**: `referrer_id`
- **Value**: Customer UUID
- **Lifecycle**: Set on referral link click, cleared after prospect submission

### Database Impact
- **prospects table**: `referrer_id` field populated
- **payments table**: New record with mode "Referral Credit"
- **subscriptions table**: Referrer's `balance` reduced by 300

### Environment Detection
```typescript
const baseUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://all-star-three.vercel.app';
```

### Portal URL Structure
- Customer portal is at: `/portal/[customer_id]`
- The customer ID is extracted from `useParams()` in the page component
- This ID is used to generate the referral link: `/ref/{customer_id}`

## Files Modified/Created

1. ✅ `app/(customer)/portal/[id]/page.tsx` - Added share functionality
2. ✅ `app/ref/[id]/page.tsx` - Created referral redirect handler
3. ✅ `components/SubscribeModal.tsx` - Auto-populate referrer from session
4. ✅ `components/admin/EditProspectModal.tsx` - Already had referral credit logic

## Testing Checklist

- [ ] Share to Facebook opens dialog with correct URL format `/ref/{customer_id}`
- [ ] Copy link copies correct URL to clipboard
- [ ] Clicking referral link stores customer ID in session
- [ ] Subscribe form shows referrer name when session exists
- [ ] Session cleared after prospect submission
- [ ] Admin verification applies ₱300 credit to referrer
- [ ] Payment record created with "Referral Credit" mode
- [ ] Works on both localhost and production
- [ ] Customer ID correctly extracted from portal URL `/portal/[id]`
