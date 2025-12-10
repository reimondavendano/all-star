# Invoice & Payment System Implementation

## Overview

This document describes the comprehensive Invoice & Payment System implemented for the AllStar ISP billing application.

## Files Created/Modified

### New Files

| File | Description |
|------|-------------|
| `lib/sms.ts` | Semaphore SMS integration with templates |
| `lib/billing.ts` | Billing utilities, schedules, and calculations |
| `lib/invoiceService.ts` | Invoice generation with pro-rating logic |
| `lib/paymentService.ts` | Payment processing and balance management |
| `app/api/cron/route.ts` | Cron job API for automated billing |
| `app/admin/billing/page.tsx` | Admin billing management page |
| `components/BalanceDisplay.tsx` | Reusable balance display components |
| `database/migration_billing_system.sql` | Database migration for new tables |
| `vercel.json` | Vercel cron configuration |

### Modified Files

| File | Changes |
|------|---------|
| `components/admin/GenerateInvoiceModal.tsx` | Enhanced with pro-rating preview and credits |
| `components/admin/RecordPaymentModal.tsx` | Updated with balance management |
| `components/admin/Sidebar.tsx` | Added Billing menu item |
| `types/invoice.ts` | Added new fields for pro-rating and discounts |
| `types/payment.ts` | Added payment history types |
| `data/mockInvoices.ts` | Updated to match new types |

---

## Features Implemented

### 1. SMS Integration (Semaphore)

- **File:** `lib/sms.ts`
- API integration with Semaphore SMS service
- Template-based messages:
  - Invoice generated notification
  - Due date reminder
  - Disconnection warning
  - Payment confirmation
  - New subscription welcome

**Configuration Required:**
Add to `.env.local`:
```
SEMAPHORE_API_KEY=your_api_key
SEMAPHORE_SENDER_NAME=ALLSTAR
```

### 2. Invoice Generation Schedule

| Business Unit | Invoice Gen | Billing Period | Due Date | Disconnection |
|--------------|-------------|----------------|----------|---------------|
| Bulihan | 10th | Prev 15th - Current 15th | 15th | 20th |
| Extension | 10th | Prev 15th - Current 15th | 15th | 20th |
| Malanggam | 25th | 1st - 30th (or last day) | 30th | 5th (next month) |

### 3. Cron Job Setup

- **API Route:** `/api/cron`
- **Vercel Config:** Runs daily at midnight UTC
- **Manual Trigger:** POST to `/api/cron` with action parameters

**Cron Secret (optional for security):**
```
CRON_SECRET=your_secret_key
```

### 4. Balance Management

**Core Principle:** `subscriptions.balance` is updated after EVERY transaction.

- **Positive value:** Balance (amount owed)
- **Negative value:** Credits (advance payment)
- **Formula:** `New Balance = Current Balance - Payment Amount`

### 5. Pro-rated Billing

Calculates daily rate for new customers:
```
Daily Rate = Monthly Plan / 30
Pro-rated Amount = Daily Rate × Days Used
```

Applied when:
- First invoice for new customer
- Installation date is after billing period start
- Installation date is close to invoice generation date

### 6. Referral Discount

- ₱300 discount for customers with referrers
- Applied only to the FIRST subscription
- Applied once per customer (tracked via `referral_credit_applied`)

### 7. Payment Status Logic

| Status | Condition |
|--------|-----------|
| Paid | Payment ≥ Amount Due |
| Partially Paid | 0 < Payment < Amount Due |
| Unpaid | No payment received |
| Advanced | Payment > Amount Due (creates credits) |

---

## Database Migration

Run `database/migration_billing_system.sql` in Supabase SQL Editor to:

1. Add `invoice_id` to payments table
2. Create `payment_history` table for auditing
3. Create `invoice_generation_log` table
4. Create `sms_log` table
5. Add pro-rating fields to invoices
6. Add indexes for performance

---

## UI Components

### BalanceDisplay Component

Usage:
```tsx
import BalanceDisplay, { BalanceInline, BalanceBadge } from '@/components/BalanceDisplay';

// Full display with icon
<BalanceDisplay balance={500} size="lg" />

// Inline display
<BalanceInline balance={-300} />

// Badge display
<BalanceBadge balance={0} />
```

### Admin Billing Page

Access via sidebar: **Admin → Billing**

Features:
- Invoice generation history
- SMS notification logs
- Manual trigger for:
  - Invoice generation
  - Due date reminders
  - Disconnection warnings

---

## API Endpoints

### GET /api/cron

Automatically runs scheduled tasks based on current date.

### POST /api/cron

Manual trigger for specific actions:

```json
// Generate Invoices
{
  "action": "generate_invoices",
  "businessUnitId": "uuid",
  "year": 2025,
  "month": 12,
  "sendSms": true
}

// Send Due Reminders
{
  "action": "send_due_reminders",
  "businessUnitId": "uuid"
}

// Send Disconnection Warnings
{
  "action": "send_disconnection_warnings",
  "businessUnitId": "uuid"
}
```

---

## Testing Checklist

- [x] Business unit schedule configuration
- [x] Invoice generation with pro-rating
- [x] Balance updates after payments
- [x] Credits applied to next invoice
- [x] Referral discounts applied correctly
- [x] SMS notification templates
- [x] Cron job scheduling
- [x] Admin billing page
- [x] Balance display components
- [x] TypeScript types

**Manual Testing Required:**
- [ ] Run database migration
- [ ] Configure Semaphore API key
- [ ] Test SMS sending
- [ ] Verify cron job execution on Vercel
- [ ] Test edge cases (short months, leap years)

---

## Environment Variables Required

```env
# Existing
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# New - SMS (Semaphore)
SEMAPHORE_API_KEY=your_semaphore_api_key
SEMAPHORE_SENDER_NAME=ALLSTAR

# Optional - Cron Security
CRON_SECRET=your_cron_secret
```
