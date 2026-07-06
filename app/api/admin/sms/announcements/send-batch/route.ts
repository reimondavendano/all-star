import { NextResponse } from 'next/server';
import { sendSMS } from '@/lib/sms';

export async function POST(request: Request) {
    try {
        const { messages } = await request.json();

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
        }

        if (messages.length > 20) {
            return NextResponse.json({ error: 'Max batch size exceeded' }, { status: 400 });
        }

        let sent = 0;
        let failed = 0;

        const promises = messages.map(async (msg) => {
            const result = await sendSMS({ to: msg.to, message: msg.message });
            if (result.success) {
                sent++;
            } else {
                failed++;
                console.error(`Failed to send SMS to ${msg.to}:`, result.error);
            }
        });

        await Promise.all(promises);

        return NextResponse.json({
            success: true,
            sent,
            failed
        });

    } catch (error: any) {
        console.error('Error sending bulk SMS batch:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
