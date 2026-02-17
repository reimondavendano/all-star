# Reconnection and Invoice Generation Changes

## Summary
Fixed the invoice generation behavior for reconnected subscriptions and general expense calculation in dashboard.

## Changes Made

### 1. Database Schema Changes
**File:** `all-star/database/20260217_add_reconnection_disconnection_dates.sql`
- Added `last_reconnection_date` column to subscriptions table
- Added `last_disconnection_date` column to subscriptions table
- Added indexes for performance
- These fields track when subscriptions are reconnected/disconnected

### 2. Reconnection Logic (No Invoice Generation)
**File:** `all-star/app/actions/activation.ts`
- Removed automatic invoice generation on reconnection
- Now stores `last_reconnection_date` when subscription is reactivated
- Invoice must be generated manually using "Generate Invoice" button

**File:** `all-star/components/admin/ActivationModal.tsx`
- Removed `generateInvoice` state variable
- Removed invoice generation checkbox from UI
- Updated success message to inform users to use "Generate Invoice" button
- Simplified activation flow

### 3. Disconnection Logic (Store Date)
**File:** `all-star/app/actions/disconnection.ts`
- Now stores `last_disconnection_date` when subscription is disconnected
- No other changes to disconnection behavior

### 4. Invoice Generation Logic (Use Reconnection Date)
**File:** `all-star/lib/invoiceService.ts`
- Added `last_reconnection_date` to Subscription interface
- Updated subscription query to fetch `last_reconnection_date`
- Modified invoice generation logic to use `last_reconnection_date` as the effective start date
- Logic now checks: if `last_reconnection_date` exists and is more recent than `date_installed`, use it as the billing start date
- Pro-rating now works correctly for reconnected subscriptions

### 5. Dashboard Expense Calculation Fix
**File:** `all-star/app/admin/dashboard/page.tsx`
- Fixed expense calculation to include general expenses (those with only `business_unit_id`)
- Previously only counted expenses linked to subscriptions
- Now includes both:
  - Expenses with direct `business_unit_id` match
  - Expenses linked to subscriptions in the selected business unit

## New Workflow

### Disconnect → Reconnect → Generate Invoice

**Example:**
1. **Jan 15** - Regular bill generated (₱999)
2. **Feb 22** - Customer disconnected (bill unpaid)
   - Creates disconnection invoice from Feb 16 to Feb 22 (₱200)
   - Stores `last_disconnection_date = Feb 22`
3. **Feb 25** - Customer pays total (₱1,199) and reconnects
   - Subscription reactivated
   - Stores `last_reconnection_date = Feb 25`
   - **NO invoice created automatically**
4. **March 10** - Admin clicks "Generate Invoice" button
   - Creates invoice from Feb 25 to March 15
   - Uses `last_reconnection_date` as the start date
   - Pro-rates amount based on actual days of service

## Benefits

1. **More Control**: Admins decide when to generate invoices for reconnected customers
2. **Accurate Billing**: Invoices use the actual reconnection date, not installation date
3. **Flexible**: Can generate invoice immediately or wait until next billing cycle
4. **Complete Expense Tracking**: Dashboard now shows all expenses including general ones

## Migration Required

Run the SQL migration:
```sql
psql -h <host> -U <user> -d <database> -f all-star/database/20260217_add_reconnection_disconnection_dates.sql
```

## Testing Checklist

- [ ] Disconnect a subscription - verify `last_disconnection_date` is stored
- [ ] Reconnect a subscription - verify `last_reconnection_date` is stored and NO invoice is created
- [ ] Generate invoice for reconnected subscription - verify it uses `last_reconnection_date` as start date
- [ ] Check dashboard with business unit filter - verify general expenses are included in total
- [ ] Verify Bulihan shows 675 total (375 + 119 + 181 or similar breakdown)
