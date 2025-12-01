# PayMongo Integration Guide (Sandbox)

## ✅ Implementation Status

**COMPLETED** - The PayMongo payment integration is fully implemented and ready for testing in sandbox mode.

### What's Implemented:
- ✅ E-Wallet payments (GCash, Maya, GrabPay)
- ✅ Online Banking (BPI, UnionBank)
- ✅ Payment source creation API (`/api/paymongo/create-source`)
- ✅ Payment finalization API (`/api/paymongo/create-payment`)
- ✅ Customer portal payment flow (`/portal/[id]`)
- ✅ Payment success page with database recording
- ✅ Automatic balance updates after payment

### Current Configuration:
Your `.env.local` already contains:
```env
NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY=pk_test_your_public_key
PAYMONGO_SECRET_KEY=sk_test_your_secret_key
PAYMONGO_API_URL=https://api.paymongo.com/v1
```

**⚠️ IMPORTANT**: Replace `pk_test_your_public_key` and `sk_test_your_secret_key` with your actual PayMongo test keys from the dashboard.

---

## 🧪 Testing in Sandbox Mode

### Step 1: Get Your Test Keys
1. Log in to [PayMongo Dashboard](https://dashboard.paymongo.com/)
2. Toggle **"View Test Data"** in the top right
3. Go to **Developers** → **API Keys**
4. Copy your **Secret Key** (`sk_test_...`) and **Public Key** (`pk_test_...`)
5. Update your `.env.local` file with these keys

### Step 2: Test the Payment Flow
1. Navigate to a customer portal: `http://localhost:3000/portal/[customer-id]`
2. Click **"Pay Bill"** or **"Pay All Bills"**
3. Select a payment method (e.g., GCash)
4. You'll be redirected to PayMongo's test page
5. Click **"Authorize Test Payment"** to simulate success
6. You'll be redirected back to `/payment/success`
7. The payment will be recorded in your database

### Step 3: Verify in Database
After a successful test payment, check your Supabase `payments` table:
- A new payment record should appear
- The subscription balance should be reduced
- Reference number should match the PayMongo payment ID

---

## 📋 Payment Flow Overview

```
Customer Portal → Pay Bill Button → Payment Modal
    ↓
Select Payment Method (GCash/Maya/etc)
    ↓
API: /api/paymongo/create-source
    ↓
Redirect to PayMongo Checkout
    ↓
Customer Authorizes Payment
    ↓
Redirect to /payment/success
    ↓
API: /api/paymongo/create-payment
    ↓
Record in Supabase (payments table)
    ↓
Update Subscription Balance
    ↓
Show Success Message → Redirect to Portal
```

---

This guide outlines the steps to implement **GCash**, **PayMaya**, and **Bank Transfer** functionality using the PayMongo API in a Next.js application.

## 1. Prerequisites

1.  **PayMongo Account**: Sign up at [PayMongo](https://paymongo.com/).
2.  **API Keys**: Go to the **Developers** tab in the dashboard and toggle **View Test Data** to get your **Secret Key** (`sk_test_...`) and **Public Key** (`pk_test_...`).
3.  **Dependencies**: Install `axios` for making API requests.
    ```bash
    npm install axios
    ```

## 2. Environment Setup

Add your PayMongo keys to your `.env.local` file:

```env
NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY=pk_test_your_public_key
PAYMONGO_SECRET_KEY=sk_test_your_secret_key
PAYMONGO_API_URL=https://api.paymongo.com/v1
```

---

## 3. Implementation Strategy

We will use **Next.js API Routes** (Server-side) to handle sensitive operations like creating sources and payments to keep your Secret Key secure.

### Payment Flows

1.  **E-Wallets (GCash, Maya, GrabPay)**: Use the **Sources API**.
    *   **Step 1**: Create a `Source` resource.
    *   **Step 2**: Redirect the user to the `checkout_url` provided in the response.
    *   **Step 3**: User authorizes payment.
    *   **Step 4**: Handle the redirect back to your app.
    *   **Step 5**: Create a `Payment` resource using the Source ID.

2.  **Direct Online Banking / Cards**: Use the **Payment Intents API** (more complex, involves attaching payment methods). *For simplicity, this guide focuses on the E-Wallet flow which is most requested.*

---

## 4. Step-by-Step Implementation (E-Wallets)

### Step 1: Create the Backend API Route

Create a file `app/api/paymongo/create-source/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { amount, type, redirect_success, redirect_failed } = body;

        // PayMongo expects amount in centavos (e.g., 100.00 -> 10000)
        const amountInCentavos = Math.round(amount * 100);

        const options = {
            method: 'POST',
            url: 'https://api.paymongo.com/v1/sources',
            headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                authorization: `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY!).toString('base64')}`
            },
            data: {
                data: {
                    attributes: {
                        amount: amountInCentavos,
                        redirect: {
                            success: redirect_success,
                            failed: redirect_failed
                        },
                        type: type, // 'gcash', 'grab_pay'
                        currency: 'PHP'
                    }
                }
            }
        };

        const response = await axios.request(options);
        return NextResponse.json(response.data);

    } catch (error: any) {
        console.error('PayMongo Error:', error.response?.data || error.message);
        return NextResponse.json(
            { error: error.response?.data?.errors?.[0]?.detail || 'Failed to create source' },
            { status: 500 }
        );
    }
}
```

### Step 2: Create the Payment Finalization Route

After the user authorizes the payment, they are redirected back. You must then **charge** the source. Create `app/api/paymongo/create-payment/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { source_id, amount, description } = body;

        const amountInCentavos = Math.round(amount * 100);

        const options = {
            method: 'POST',
            url: 'https://api.paymongo.com/v1/payments',
            headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                authorization: `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY!).toString('base64')}`
            },
            data: {
                data: {
                    attributes: {
                        amount: amountInCentavos,
                        source: {
                            id: source_id,
                            type: 'source'
                        },
                        currency: 'PHP',
                        description: description
                    }
                }
            }
        };

        const response = await axios.request(options);
        return NextResponse.json(response.data);

    } catch (error: any) {
        console.error('Payment Creation Error:', error.response?.data || error.message);
        return NextResponse.json(
            { error: 'Failed to create payment' },
            { status: 500 }
        );
    }
}
```

### Step 3: Frontend Integration

In your `PaymentModal` or page:

```typescript
const handlePayment = async (method: 'gcash' | 'grab_pay') => {
    setIsLoading(true);
    try {
        // 1. Create Source
        const response = await axios.post('/api/paymongo/create-source', {
            amount: 1500, // Example amount
            type: method,
            redirect_success: `${window.location.origin}/payment/success`,
            redirect_failed: `${window.location.origin}/payment/failed`
        });

        const { data } = response.data;
        const checkoutUrl = data.attributes.redirect.checkout_url;
        
        // Store source ID to verify later
        sessionStorage.setItem('pending_payment_source_id', data.id);
        sessionStorage.setItem('pending_payment_amount', '1500');

        // 2. Redirect User
        window.location.href = checkoutUrl;

    } catch (error) {
        alert('Payment initialization failed');
    } finally {
        setIsLoading(false);
    }
};
```

### Step 4: Handling the Redirect (Success Page)

Create a page at `app/payment/success/page.tsx`:

```typescript
'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';

export default function PaymentSuccessPage() {
    const [status, setStatus] = useState('processing');

    useEffect(() => {
        const finalizePayment = async () => {
            const sourceId = sessionStorage.getItem('pending_payment_source_id');
            const amount = sessionStorage.getItem('pending_payment_amount');

            if (!sourceId || !amount) return;

            try {
                // 3. Create Payment (Charge the source)
                await axios.post('/api/paymongo/create-payment', {
                    source_id: sourceId,
                    amount: parseFloat(amount),
                    description: 'Monthly Subscription'
                });
                
                setStatus('success');
                // TODO: Update database (subscription balance, invoice status)
                
            } catch (error) {
                setStatus('failed');
            }
        };

        finalizePayment();
    }, []);

    return <div>{status === 'success' ? 'Payment Successful!' : 'Processing...'}</div>;
}
```

---

## 5. Testing in Sandbox

### GCash / GrabPay
1.  Trigger the payment flow.
2.  You will be redirected to a PayMongo mock page.
3.  **Success**: Click "Authorize Test Payment".
4.  **Failure**: Click "Fail Test Payment".

### Bank Transfer / Cards (Payment Intents)
For cards, use the test card numbers provided in the PayMongo dashboard:
-   **Visa**: `4242 4242 4242 4242`
-   **Mastercard**: `5555 5555 5555 5555`
-   **OTP**: `123456` (if asked)

---

## 6. Webhooks (Recommended for Production)

Relying on the client-side redirect (Step 4) is not 100% reliable (user might close the tab). For production, set up **Webhooks**:

1.  Go to PayMongo Dashboard > Developers > Webhooks.
2.  Add an endpoint: `https://your-domain.com/api/webhooks/paymongo`.
3.  Listen for `source.chargeable` event.
4.  When received, trigger the "Create Payment" logic on the server automatically.

