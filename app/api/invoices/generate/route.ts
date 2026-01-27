/**
 * Manual Invoice Generation API
 * Handles manual invoice generation for activation/reconnection scenarios
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateActivationInvoice } from '@/lib/invoiceService';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { subscriptionId, activationDate } = body;

        // Validate inputs
        if (!subscriptionId) {
            return NextResponse.json(
                { error: 'subscriptionId is required' },
                { status: 400 }
            );
        }

        if (!activationDate) {
            return NextResponse.json(
                { error: 'activationDate is required' },
                { status: 400 }
            );
        }

        // Generate activation invoice
        const result = await generateActivationInvoice(
            subscriptionId,
            new Date(activationDate)
        );

        if (!result.success) {
            return NextResponse.json(
                { error: result.errors.join(', ') },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            invoiceId: result.invoiceId,
            amount: result.amount,
            message: 'Activation invoice generated successfully'
        });

    } catch (error) {
        console.error('Error generating activation invoice:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
