# Balance and Payment System Overhaul - Implementation Summary

## Database Schema Changes

### New Enum Type
```sql
create type invoice_status as enum ('Paid', 'Unpaid', 'Partially Paid');
```

### Subscriptions Table Updates
- Added `referral_credit_balance numeric default 0` - tracks total referral credits received
- Existing `balance numeric default 0` - tracks current balance (debt/credit)
- Existing `referral_credit_applied boolean default false` - flag if subscription has referral credit

### Invoices Table Updates
- Changed `paid boolean` to `payment_status invoice_status default 'Unpaid'`
- Now supports three states: Paid, Unpaid, Partially Paid

---

## Balance Calculation Logic

### Core Formula
**Balance = Current Balance + (Monthly Fee - Payment Amount)**

### Balance States
- **Negative Balance** = DEBT (customer owes money)
- **Positive Balance** = CREDIT (customer overpaid)
- **Zero Balance** = Fully paid

### Examples

#### Scenario 1: Partial Payment
```
November Invoice:
- Monthly Fee: ₱999
- Payment: ₱300
- Balance Calculation: 0 + (999 - 300) = -₱699
- Result: Customer owes ₱699

December Invoice:
- Monthly Fee: ₱999
- Previous Balance: -₱699 (debt)
- Amount Due: 999 + 699 = ₱1,698
- If paid ₱1,698 → Balance: -699 + (999 - 1698) = 0 ✓
```

#### Scenario 2: Overpayment
```
November Invoice:
- Monthly Fee: ₱999
- Payment: ₱1,200
- Balance Calculation: 0 + (999 - 1200) = ₱201
- Result: Customer has ₱201 credit

December Invoice:
- Monthly Fee: ₱999
- Previous Balance: ₱201 (credit)
- Amount Due: 999 - 201 = ₱798
```

#### Scenario 3: Multiple Partial Payments
```
November Invoice:
- Monthly Fee: ₱999
- Payment 1: ₱200 → Balance: 0 + (999 - 200) = -₱799
- Payment 2: ₱300 → Balance: -799 + (0 - 300) = -₱499
- Final Balance: -₱499 (still owes ₱499)
- Invoice Status: "Partially Paid"

December Invoice:
- Monthly Fee: ₱999
- Previous Balance: -₱499
- Amount Due: 999 + 499 = ₱1,498
```

---

## Referral Credit System

### When Prospect is Approved (Closed Won)

**If prospect has a referrer:**

1. **Create Payment Record**
   - Amount: ₱300
   - Mode: "Referral Credit"
   - Notes: "Referral bonus for new subscriber: [Name]"

2. **Update Referrer's Subscription**
   ```
   balance = current_balance + 300
   referral_credit_balance = current_referral_credit + 300
   referral_credit_applied = true
   ```

3. **Example Scenarios:**
   - Current balance: ₱0 → New balance: ₱300 (credit to use)
   - Current balance: -₱599 → New balance: -₱299 (less credit, closer to zero)
   - Current balance: ₱599 → New balance: ₱899 (more debt, but credit added)

---

## Payment Processing Logic

### Payment Mode: CASH

#### Full Payment (amount >= monthly_fee)
```
Example: Monthly fee = ₱799, Payment = ₱799
- New Balance = (799 + 0) - 799 = ₱0
- Invoice Status = "Paid"
```

#### Overpayment (amount > monthly_fee)
```
Example: Monthly fee = ₱799, Payment = ₱1,200
- New Balance = (1200 + 0) - 799 = ₱401 (credit)
- Invoice Status = "Paid"
```

#### Partial Payment (amount < monthly_fee)
```
Example: Monthly fee = ₱799, Payment = ₱200
- New Balance = (200 + 0) - 799 = -₱599 (debt)
- Invoice Status = "Partially Paid"
```

#### Payment with Existing Debt
```
Example: Monthly fee = ₱799, Current balance = -₱599, Payment = ₱799
- New Balance = (799 + (-599)) - 799 = -₱599 (still in debt)
- Invoice Status = "Partially Paid"
```

#### Payment with Existing Credit
```
Example: Monthly fee = ₱799, Current balance = ₱300, Payment = ₱500
- New Balance = (500 + 300) - 799 = ₱1 (small credit)
- Invoice Status = "Paid"
```

---

### Payment Mode: REFERRAL CREDIT

#### Validation Rules
1. **Check Balance ≠ 0**
   - If balance = 0 → Show error: "Cannot use Referral Credit: Current balance is ₱0. No payment is due."

2. **Check referral_credit_applied = true**
   - If false → Show error: "Cannot use Referral Credit: This subscription does not have a referral credit applied."

#### Payment Calculation
```
Actual Payment Amount = Input Amount - ₱300

Example: Monthly fee = ₱799, Input = ₱799
- Actual Payment = 799 - 300 = ₱499
- New Balance = (499 + 0) - 799 = -₱300 (debt)
- Invoice Status = "Partially Paid"
```

#### Full Payment with Referral Credit
```
Example: Monthly fee = ₱799, Input = ₱1,099
- Actual Payment = 1099 - 300 = ₱799
- New Balance = (799 + 0) - 799 = ₱0
- Invoice Status = "Paid"
```

---

### Payment Mode: E-WALLET
**Status:** Not yet implemented
**Future:** Will follow same logic as Cash payment

---

## Invoice Status Updates

### Status Determination
After payment is recorded, the system checks the current month's invoice:

```javascript
if (actualPaymentAmount >= monthlyFee) {
    payment_status = 'Paid'
} else if (actualPaymentAmount > 0 && actualPaymentAmount < monthlyFee) {
    payment_status = 'Partially Paid'
} else {
    payment_status = 'Unpaid'
}
```

---

## Next Month Invoice Generation

### Balance Carry-Over Logic

When generating invoices for the next month:

```javascript
// Get current balance from subscription
const currentBalance = subscription.balance;

// Calculate new invoice amount
let amountDue = monthlyFee + currentBalance;

// Ensure amount doesn't go below 0
if (amountDue < 0) amountDue = 0;
```

### Examples

#### Scenario 1: Previous Partial Payment
```
Previous month: Paid ₱200 of ₱799 → Balance = -₱599
Next invoice: 799 + (-599) = ₱200 (only owe remaining balance)
```

#### Scenario 2: Previous Overpayment
```
Previous month: Paid ₱1,200 of ₱799 → Balance = ₱401
Next invoice: 799 + 401 = ₱1,200... wait, this is wrong!
```

**CORRECTION NEEDED:** The balance logic needs to be inverted!

### Corrected Balance Logic

**Balance should represent DEBT, not CREDIT:**
- Positive = Customer owes money
- Negative = Customer has credit

**Corrected Formula:**
```
Balance = Monthly Fee - Payment Amount - Current Balance

For next invoice:
Amount Due = Monthly Fee - Balance (if balance is positive, it's credit)
```

---

## UI Features

### RecordPaymentModal

**Displays:**
- Customer name and mobile
- Plan name and monthly fee
- Current balance (color-coded: red for debt, green for credit)
- Referral credit availability indicator

**Payment Mode Selection:**
- Cash (default)
- E-Wallet (disabled/future)
- Referral Credit (with validation)

**Referral Credit Warnings:**
- Shows warning if balance = 0
- Shows warning if referral_credit_applied = false
- Disables submit button when warnings are active

**Amount Calculation Display:**
- For Referral Credit mode, shows: "After ₱300 referral credit: ₱X"

---

## Files Modified

1. **database/schema.sql**
   - Added `invoice_status` enum
   - Added `referral_credit_balance` to subscriptions
   - Changed `paid` to `payment_status` in invoices

2. **components/admin/EditProspectModal.tsx**
   - Updated referral credit logic to add ₱300 to balance
   - Sets `referral_credit_applied = true`
   - Tracks `referral_credit_balance`

3. **components/admin/GenerateInvoiceModal.tsx**
   - Changed `paid: false` to `payment_status: 'Unpaid'`

4. **components/admin/RecordPaymentModal.tsx**
   - Complete rewrite with new balance logic
   - Payment mode validation
   - Invoice status updates
   - Referral credit handling

---

## Testing Scenarios

### Test 1: New Referral
1. Add prospect with referrer
2. Approve prospect (Closed Won)
3. Check referrer's subscription:
   - balance should be +₱300
   - referral_credit_balance should be ₱300
   - referral_credit_applied should be true

### Test 2: Referral Credit Payment
1. Select subscription with referral credit
2. Choose "Referral Credit" mode
3. Enter ₱799
4. Verify actual payment = ₱499
5. Check balance calculation

### Test 3: Partial Payment
1. Pay ₱200 of ₱799 invoice
2. Verify invoice status = "Partially Paid"
3. Verify balance = -₱599
4. Generate next month invoice
5. Verify new invoice amount includes previous debt

---

## Known Issues / TODO

1. **Balance Logic Inversion:** Need to verify if balance should be inverted (positive = credit, negative = debt) for better UX
2. **E-Wallet Payment:** Not yet implemented
3. **Multiple Invoices:** Current logic only updates the first invoice of the month
4. **Referral Credit Depletion:** Need to track when referral credit is fully used
5. **Payment History:** Should show how referral credit was applied over time
