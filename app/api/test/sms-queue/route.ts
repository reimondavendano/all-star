import { NextRequest, NextResponse } from 'next/server';
import { sendBulkSMS } from '@/lib/sms';

export async function POST(request: NextRequest) {
    try {
        const { messages } = await request.json();
        
        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({
                success: false,
                error: 'messages array is required'
            }, { status: 400 });
        }
        
        if (messages.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'messages array cannot be empty'
            }, { status: 400 });
        }
        
        // Validate each message
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (!msg.to || !msg.message) {
                return NextResponse.json({
                    success: false,
                    error: `Message at index ${i} is missing 'to' or 'message' field`
                }, { status: 400 });
            }
        }
        
        console.log(`[SMS Queue Test] Starting bulk send of ${messages.length} messages`);
        
        const startTime = Date.now();
        const result = await sendBulkSMS(messages);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log(`[SMS Queue Test] Completed in ${duration}s - Sent: ${result.sent}, Failed: ${result.failed}`);
        
        return NextResponse.json({
            success: true,
            sent: result.sent,
            failed: result.failed,
            total: messages.length,
            durationSeconds: parseFloat(duration),
            averagePerMessage: (parseFloat(duration) / messages.length).toFixed(2) + 's'
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    return NextResponse.json({
        message: 'SMS Queue Test Endpoint',
        usage: 'POST with JSON body containing messages array',
        rateLimit: '100 SMS per minute (with 6 second delays between batches of 10)',
        example: {
            messages: [
                { to: '09123456789', message: 'Test message 1' },
                { to: '09987654321', message: 'Test message 2' },
                { to: '09111222333', message: 'Test message 3' }
            ]
        },
        notes: [
            'Each message must have "to" and "message" fields',
            'Phone numbers should be in format: 09XXXXXXXXX or 639XXXXXXXXX',
            'Messages are sent in batches of 10 with 6 second delays',
            'Failed messages are automatically retried up to 3 times'
        ]
    });
}
