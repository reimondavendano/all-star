import { NextRequest, NextResponse } from 'next/server';
import { sendSMS, SMSTemplates } from '@/lib/sms';

export async function POST(request: NextRequest) {
    try {
        const { to, message, template } = await request.json();
        
        if (!to) {
            return NextResponse.json({
                success: false,
                error: 'Phone number (to) is required'
            }, { status: 400 });
        }
        
        let smsMessage = message;
        
        // Use template if specified
        if (template === 'test') {
            smsMessage = `Test SMS from Allstar\nTimestamp: ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}\nThis is a test message.`;
        } else if (template === 'invoice') {
            smsMessage = SMSTemplates.invoiceGenerated(
                'Test Customer',
                999,
                'March 15, 2026',
                'Test Business Unit',
                'portal.allstar.com/test',
                0
            );
        } else if (template === 'reminder') {
            smsMessage = SMSTemplates.dueDateReminder(
                'Test Customer',
                999,
                'March 15, 2026',
                'portal.allstar.com/test'
            );
        } else if (template === 'warning') {
            smsMessage = SMSTemplates.disconnectionWarning(
                'Test Customer',
                'March 20, 2026',
                'portal.allstar.com/test',
                999
            );
        }
        
        if (!smsMessage) {
            return NextResponse.json({
                success: false,
                error: 'Message is required'
            }, { status: 400 });
        }
        
        const result = await sendSMS({ to, message: smsMessage });
        
        return NextResponse.json({
            success: result.success,
            messageId: result.messageId,
            error: result.error,
            sentTo: to,
            messageLength: smsMessage.length,
            message: smsMessage
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
        message: 'SMS Test Endpoint',
        usage: 'POST with JSON body',
        examples: [
            {
                description: 'Send custom message',
                body: {
                    to: '09123456789',
                    message: 'Your custom message here'
                }
            },
            {
                description: 'Send test template',
                body: {
                    to: '09123456789',
                    template: 'test'
                }
            },
            {
                description: 'Send invoice template',
                body: {
                    to: '09123456789',
                    template: 'invoice'
                }
            },
            {
                description: 'Send reminder template',
                body: {
                    to: '09123456789',
                    template: 'reminder'
                }
            },
            {
                description: 'Send warning template',
                body: {
                    to: '09123456789',
                    template: 'warning'
                }
            }
        ]
    });
}
