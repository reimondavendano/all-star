/**
 * SMS Test Endpoint
 * Use this to test the Semaphore SMS integration
 * 
 * GET /api/sms/test?phone=09171234567&message=Test
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendSMS, SMSTemplates } from '@/lib/sms';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const phone = searchParams.get('phone');
    const message = searchParams.get('message') || 'Hello! This is a test message from AllStar. - Allstar';

    // Check API key configuration
    const apiKey = process.env.SEMAPHORE_API_KEY;
    const senderName = process.env.SEMAPHORE_SENDER_NAME;

    if (!phone) {
        return NextResponse.json({
            error: 'Phone number required',
            usage: '/api/sms/test?phone=09171234567&message=Your message here',
            config: {
                apiKeyConfigured: !!apiKey,
                apiKeyPreview: apiKey ? `${apiKey.substring(0, 8)}...` : null,
                senderName: senderName || 'ALLSTAR (default)',
            }
        }, { status: 400 });
    }

    console.log('=== SMS Test ===');
    console.log('Phone:', phone);
    console.log('Message:', message);
    console.log('API Key configured:', !!apiKey);
    console.log('Sender Name:', senderName);

    try {
        const result = await sendSMS({ to: phone, message });

        return NextResponse.json({
            phone,
            message,
            result,
            config: {
                apiKeyConfigured: !!apiKey,
                senderName: senderName || 'ALLSTAR (default)',
            }
        });
    } catch (error) {
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error',
            phone,
            message,
        }, { status: 500 });
    }
}

// POST method for testing with body
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { phone, message, template, templateData } = body;

        if (!phone) {
            return NextResponse.json({ error: 'Phone number required' }, { status: 400 });
        }

        let finalMessage = message;

        // Use template if specified
        if (template && templateData) {
            switch (template) {
                case 'invoiceGenerated':
                    finalMessage = SMSTemplates.invoiceGenerated(
                        templateData.customerName,
                        templateData.amount,
                        templateData.dueDate,
                        templateData.businessUnit
                    );
                    break;
                case 'dueDateReminder':
                    finalMessage = SMSTemplates.dueDateReminder(
                        templateData.customerName,
                        templateData.amount,
                        templateData.dueDate
                    );
                    break;
                case 'disconnectionWarning':
                    finalMessage = SMSTemplates.disconnectionWarning(
                        templateData.customerName,
                        templateData.disconnectionDate
                    );
                    break;
                case 'paymentReceived':
                    finalMessage = SMSTemplates.paymentReceived(
                        templateData.customerName,
                        templateData.amount,
                        templateData.newBalance
                    );
                    break;
                default:
                    if (!message) {
                        return NextResponse.json({ error: 'Message or valid template required' }, { status: 400 });
                    }
            }
        }

        if (!finalMessage) {
            return NextResponse.json({ error: 'Message required' }, { status: 400 });
        }

        const result = await sendSMS({ to: phone, message: finalMessage });

        return NextResponse.json({
            phone,
            message: finalMessage,
            result,
        });
    } catch (error) {
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
