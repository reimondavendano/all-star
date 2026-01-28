# Feature Enhancements Implementation Plan

## Overview
This document outlines the implementation plan for multiple feature enhancements across the AllStar system.

## 1. E-Payment Verification Enhancements

### Current State
- Single view showing all payments with status filter dropdown
- Status filter: all/pending/approved/rejected

### Required Changes
✅ **Add Tabs for Payment Status**
- Replace status dropdown with tabs (like Invoices & Payments page)
- Tabs: Pending | Approved | Rejected
- Show count badges on each tab
- Default to "Pending" tab

### Files to Modify
- `app/admin/verification/page.tsx` - Add tab navigation
- Keep existing month filter and search functionality

---

## 2. Collectors Portal Enhancements

### 2.1 Add E-Payment Verification
**New Page:** `app/(collector)/collector/verification/page.tsx`
- Copy functionality from admin verification
- Collectors can approve/reject payments
- Same tab structure: Pending | Approved | Rejected

### 2.2 Add Expenses Menu
**New Page:** `app/(collector)/collector/expenses/page.tsx`
- Track collector expenses
- Fields: Date, Amount, Category, Description, Receipt (optional)
- Categories: Transportation, Meals, Materials, Other
- Export to Excel functionality

### 2.3 Add Notes per Invoice
**Modify:** `app/(collector)/collector/invoices/page.tsx`
- Add "Notes" button/icon per invoice
- Modal to add/edit notes
- Common use case: "Subscriber requested extension until [date]"
- Notes visible to admin and collector
- Store in new `invoice_notes` table or add `notes` column to invoices

### 2.4 Cash Payments by Business Unit
**Modify:** `app/(collector)/collector/invoices/page.tsx`
- Add Business Unit filter (like admin page)
- Filter invoices by selected business unit
- Default to "All Units"

### 2.5 Invoice Status Tabs
**Modify:** `app/(collector)/collector/invoices/page.tsx`
- Add tabs: Unpaid | Partially Paid | Paid
- Similar to admin Invoices & Payments page
- Show count badges

### Files to Create/Modify
- **Create:**
  - `app/(collector)/collector/verification/page.tsx`
  - `app/(collector)/collector/expenses/page.tsx`
  - `components/collector/InvoiceNotesModal.tsx`
  - `components/collector/ExpenseModal.tsx`

- **Modify:**
  - `components/collector/CollectorSidebar.tsx` - Add menu items
  - `components/collector/CollectorMobileNav.tsx` - Add menu items
  - `app/(collector)/collector/invoices/page.tsx` - Add tabs, BU filter, notes

---

## 3. SMS Triggers

### 3.1 New Subscriber SMS
**Trigger:** When prospect status changes to "Closed Won"
**Location:** `components/admin/ProspectStatusModal.tsx` or prospect status change handler
**Message Template:**
```
Welcome to AllStar Internet, [Customer Name]! Your subscription is now active. 
Plan: [Plan Name] - ₱[Amount]/month. 
Thank you for choosing us! - AllStar
```

### 3.2 Invoice Generation SMS
**Status:** ✅ Already Implemented
**Location:** `lib/invoiceService.ts` - `generateInvoicesForBusinessUnit()`
**Message:** Already sends SMS when invoices are generated

### 3.3 Disconnection Notice SMS
**Trigger:** Scheduled batch job (cron)
**Location:** Create new API route `app/api/cron/disconnection-notices/route.ts`
**Schedule:** Run daily, check for invoices past due date
**Message Template:**
```
DISCONNECTION NOTICE: Hi [Customer Name], your AllStar Internet account has an 
overdue balance of ₱[Amount]. Please settle by [Date] to avoid service interruption. 
Thank you! - AllStar
```

### Implementation Details

#### 3.1 New Subscriber SMS
```typescript
// In ProspectStatusModal or status change handler
if (newStatus === 'Closed Won') {
  await sendSMS({
    to: customer.mobile_number,
    message: SMSTemplates.newSubscriber(
      customer.name,
      plan.name,
      plan.monthly_fee
    )
  });
}
```

#### 3.3 Disconnection Notice
```typescript
// app/api/cron/disconnection-notices/route.ts
export async function GET() {
  const today = new Date();
  const tasks = getTodaysTasks(today);
  
  if (tasks.shouldSendDisconnectionWarnings.length > 0) {
    for (const buType of tasks.shouldSendDisconnectionWarnings) {
      const { data: businessUnits } = await supabase
        .from('business_units')
        .select('id, name')
        .ilike('name', `%${buType}%`);
      
      for (const bu of businessUnits || []) {
        await sendDisconnectionWarnings(bu.id);
      }
    }
  }
  
  return Response.json({ success: true });
}
```

### Files to Create/Modify
- **Create:**
  - `app/api/cron/disconnection-notices/route.ts`
  
- **Modify:**
  - `lib/sms.ts` - Add `newSubscriber` template
  - `components/admin/ProspectStatusModal.tsx` - Add SMS trigger
  - `lib/invoiceService.ts` - Verify disconnection warnings function exists

---

## Database Schema Changes

### New Table: `invoice_notes`
```sql
CREATE TABLE invoice_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  note TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_invoice_notes_invoice_id ON invoice_notes(invoice_id);
```

### New Table: `collector_expenses`
```sql
CREATE TABLE collector_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collector_id UUID REFERENCES users(id),
  business_unit_id UUID REFERENCES business_units(id),
  date DATE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  category VARCHAR(50) NOT NULL,
  description TEXT,
  receipt_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_collector_expenses_collector_id ON collector_expenses(collector_id);
CREATE INDEX idx_collector_expenses_date ON collector_expenses(date);
```

---

## Implementation Priority

### Phase 1 (High Priority)
1. ✅ E-Payment Verification Tabs (Admin)
2. ✅ Collector Portal - Invoice Status Tabs
3. ✅ Collector Portal - Business Unit Filter
4. ✅ SMS - New Subscriber

### Phase 2 (Medium Priority)
5. ✅ Collector Portal - E-Payment Verification
6. ✅ Collector Portal - Invoice Notes
7. ✅ SMS - Disconnection Notice

### Phase 3 (Lower Priority)
8. ✅ Collector Portal - Expenses Menu

---

## Testing Checklist

### E-Payment Verification
- [ ] Admin can see Pending/Approved/Rejected tabs
- [ ] Tab counts are accurate
- [ ] Filtering works correctly
- [ ] Collector can access verification page
- [ ] Collector can approve/reject payments

### Collector Portal
- [ ] Invoice status tabs work (Unpaid/Partially Paid/Paid)
- [ ] Business unit filter works
- [ ] Notes can be added/edited per invoice
- [ ] Notes are visible to admin
- [ ] Expenses can be created/edited
- [ ] Expenses can be exported

### SMS
- [ ] New subscriber receives welcome SMS
- [ ] Invoice generation sends SMS (already working)
- [ ] Disconnection notices sent on schedule
- [ ] SMS templates are correct
- [ ] Phone numbers are validated

---

## Notes
- All SMS functions use existing `lib/sms.ts` infrastructure
- Disconnection warnings function already exists in `lib/invoiceService.ts`
- Need to set up Vercel cron job for disconnection notices
- Consider rate limiting for SMS to avoid spam

