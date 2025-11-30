import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { source_id, amount, description } = body;

        const amountInCentavos = Math.round(amount * 100);
        const secretKey = process.env.PAYMONGO_SECRET_KEY;

        if (!secretKey) {
            return NextResponse.json({ error: 'Server configuration error: Missing PayMongo keys' }, { status: 500 });
        }

        const options = {
            method: 'POST',
            url: 'https://api.paymongo.com/v1/payments',
            headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                authorization: `Basic ${Buffer.from(secretKey).toString('base64')}`
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
        console.error('PayMongo Payment Error:', error.response?.data || error.message);
        return NextResponse.json(
            { error: error.response?.data?.errors?.[0]?.detail || 'Failed to create payment' },
            { status: 500 }
        );
    }
}
