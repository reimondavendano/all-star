/**
 * SMS Send API Route
 * 
 * This API endpoint allows client-side components to send SMS messages
 * by calling this server-side endpoint which has access to environment variables.
 * 
 * POST /api/sms/send
 * Body: { to: string, message: string } or { to: string, template: string, templateData: object }
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendSMS, SMSTemplates } from '@/lib/sms';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { to, message, template, templateData } = body;

        if (!to) {
            return NextResponse.json({
                success: false,
                error: 'Phone number (to) is required'
            }, { status: 400 });
        }

        let finalMessage = message;

        // Use template if specified
        if (template && templateData) {
            switch (template) {
                case 'newSubscription':
                    finalMessage = SMSTemplates.newSubscription(
                        templateData.customerName,
                        templateData.planName,
                        templateData.amount
                    );
                    break;
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
                        return NextResponse.json({
                            success: false,
                            error: 'Message or valid template required'
                        }, { status: 400 });
                    }
            }
        }

        if (!finalMessage) {
            return NextResponse.json({
                success: false,
                error: 'Message required'
            }, { status: 400 });
        }

        console.log('[SMS API] Sending SMS to:', to);
        console.log('[SMS API] Message:', finalMessage);

        const result = await sendSMS({ to, message: finalMessage });

        console.log('[SMS API] Result:', result);

        return NextResponse.json({
            success: result.success,
            messageId: result.messageId,
            error: result.error,
        });
    } catch (error) {
        console.error('[SMS API] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

/**
 * Bulk SMS Send
 * POST /api/sms/send?bulk=true
 * Body: { messages: [{ to: string, message: string }] }
 */
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { messages } = body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'messages array is required'
            }, { status: 400 });
        }

        console.log(`[SMS API] Sending bulk SMS: ${messages.length} messages`);

        const results = await Promise.all(
            messages.map(async (msg: { to: string; message: string }) => {
                if (!msg.to || !msg.message) {
                    return { success: false, error: 'Missing to or message' };
                }
                return await sendSMS(msg);
            })
        );

        const sent = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        console.log(`[SMS API] Bulk results: ${sent} sent, ${failed} failed`);

        return NextResponse.json({
            success: true,
            sent,
            failed,
            results,
        });
    } catch (error) {
        console.error('[SMS API] Bulk error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
