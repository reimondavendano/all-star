# PayMongo Production Integration Guide

This guide covers the transition to **Production** and the implementation of **GCash**, **PayMaya (Maya)**, and **Bank Transfer (Online Banking)**.

## 1. Moving to Production

### Prerequisites
1.  **Account Activation**: Your PayMongo account must be **Activated**. You need to submit business documents for this.
2.  **Production Keys**: Once activated, toggle **Live Data** in the dashboard to get your live keys:
    *   `pk_live_...`
    *   `sk_live_...`
3.  **Update Environment Variables**:
    Update your `.env.local` (or your deployment environment variables on Vercel):
    ```env
    NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY=pk_live_...
    PAYMONGO_SECRET_KEY=sk_live_...
    ```

---

## 2. Payment Methods & APIs

PayMongo uses two main APIs depending on the payment method:

| Payment Method | API to Use | Resource Type |
| :--- | :--- | :--- |
| **GCash** | **Sources API** | `source` (type: `gcash`) |
| **GrabPay** | **Sources API** | `source` (type: `grab_pay`) |
| **Maya** | **Payment Intents API** | `payment_intent` |
| **Credit/Debit Card** | **Payment Intents API** | `payment_intent` |
| **BPI / UBP (Online Banking)** | **Sources API** | `source` (type: `dob` or `dob_ubp`) |

> **Note**: While GCash uses the *Sources API* (as implemented in the sandbox guide), Maya and Cards use the newer *Payment Intents API*.

---

## 3. Implementing Maya & Cards (Payment Intents)

The **Payment Intents API** is more robust and handles 3DSecure authentication automatically.

### Step 1: Create Payment Intent API Route
Create `app/api/paymongo/create-intent/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { amount, description } = body;

        const options = {
            method: 'POST',
            url: 'https://api.paymongo.com/v1/payment_intents',
            headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                authorization: `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY!).toString('base64')}`
            },
            data: {
                data: {
                    attributes: {
                        amount: Math.round(amount * 100),
                        payment_method_allowed: ['card', 'paymaya'],
                        payment_method_options: {
                            card: { request_three_d_secure: 'any' }
                        },
                        currency: 'PHP',
                        description: description,
                        capture_type: 'automatic'
                    }
                }
            }
        };

        const response = await axios.request(options);
        return NextResponse.json(response.data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
```

### Step 2: Frontend Implementation
For Payment Intents, the flow is:
1.  Create Payment Intent.
2.  Create Payment Method.
3.  Attach Payment Method to Intent.
4.  Handle Redirect (if 3DSecure/Auth is needed).

*For simplicity in Production, it is highly recommended to use **PayMongo Links** or **Checkout API** if you want to avoid building the complex UI for card inputs and 3DS handling manually.*

---

## 4. Implementing Bank Transfer (Online Banking)

PayMongo supports BPI and UnionBank via the **Sources API**, similar to GCash.

**Backend**: Use the existing `create-source` route but change the type.

**Frontend**:
```typescript
const handleBankTransfer = async () => {
    // ...
    await axios.post('/api/paymongo/create-source', {
        amount: 1500,
        type: 'dob', // For BPI (Direct Online Banking)
        // OR type: 'dob_ubp' for UnionBank
        redirect_success: '...',
        redirect_failed: '...'
    });
    // ...
}
```

---

## 5. Critical: Webhooks for Production

In production, **never rely solely on the client-side redirect** to confirm payments. Users might close the browser after paying but before redirecting back.

### Step 1: Create Webhook Route
Create `app/api/webhooks/paymongo/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
    const body = await request.json();
    const eventType = body.data.attributes.type;
    const resource = body.data.attributes.data;

    if (eventType === 'source.chargeable') {
        // Handle GCash/GrabPay/Bank Transfer
        const sourceId = resource.id;
        const amount = resource.attributes.amount;
        
        // You need to create a Payment to charge the source
        // Call your internal logic or PayMongo API to create payment
        console.log(`Source ${sourceId} is chargeable. Creating payment...`);
        
        // ... Logic to call PayMongo Create Payment API ...
    }

    if (eventType === 'payment.paid') {
        // Handle Successful Payment (Intents or Sources)
        const paymentId = resource.id;
        const description = resource.attributes.description;
        const amount = resource.attributes.amount / 100;

        // Extract Subscription ID from description or metadata
        // Update Supabase
        console.log(`Payment ${paymentId} success. Updating database...`);
        
        // Example: Update subscription balance
        // await supabase.from('payments').insert(...)
    }

    return NextResponse.json({ status: 'ok' });
}
```

### Step 2: Register Webhook
1.  Go to PayMongo Dashboard > Developers > Webhooks.
2.  Add your live URL: `https://your-domain.com/api/webhooks/paymongo`.
3.  Select events: `source.chargeable`, `payment.paid`, `payment.failed`.

---

## 6. Summary Checklist for Production

1.  [ ] **Activate Account**: Submit business docs to PayMongo.
2.  [ ] **Switch Keys**: Update `.env` with `pk_live_` and `sk_live_`.
3.  [ ] **Implement Webhooks**: Ensure payments are recorded even if the user closes the tab.
4.  [ ] **Handle Errors**: Add robust error handling for declined cards or insufficient funds.
5.  [ ] **Test with Real Money**: Perform a small real transaction (e.g., ₱100) to verify the flow, then refund it via the dashboard.
