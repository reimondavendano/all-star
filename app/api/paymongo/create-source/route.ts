import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { amount, type, redirect_success, redirect_failed } = body;

        // PayMongo expects amount in centavos (e.g., 100.00 -> 10000)
        const amountInCentavos = Math.round(amount * 100);

        // Use the secret key from environment variables
        const secretKey = process.env.PAYMONGO_SECRET_KEY;

        if (!secretKey) {
            return NextResponse.json({ error: 'Server configuration error: Missing PayMongo keys' }, { status: 500 });
        }

        const options = {
            method: 'POST',
            url: 'https://api.paymongo.com/v1/sources',
            headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                authorization: `Basic ${Buffer.from(secretKey).toString('base64')}`
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
        console.error('PayMongo Source Error:', error.response?.data || error.message);
        return NextResponse.json(
            { error: error.response?.data?.errors?.[0]?.detail || 'Failed to create source' },
            { status: 500 }
        );
    }
}
