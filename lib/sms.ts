/**
 * Semaphore SMS Integration
 * Used for sending SMS notifications for invoices, due date reminders, and disconnection warnings
 */

const SEMAPHORE_API_KEY = process.env.SEMAPHORE_API_KEY;
const SEMAPHORE_SENDER_NAME = process.env.SEMAPHORE_SENDER_NAME || 'ALLSTAR';

interface SendSMSParams {
    to: string;
    message: string;
}

interface SendSMSResponse {
    success: boolean;
    messageId?: string;
    error?: string;
}

/**
 * Format Philippine mobile number to international format
 */
function formatPhoneNumber(phone: string): string {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');

    // If starts with 0, replace with 63
    if (cleaned.startsWith('0')) {
        cleaned = '63' + cleaned.substring(1);
    }

    // If doesn't start with 63, add it
    if (!cleaned.startsWith('63')) {
        cleaned = '63' + cleaned;
    }

    return cleaned;
}

/**
 * Send SMS via Semaphore API
 */
export async function sendSMS({ to, message }: SendSMSParams): Promise<SendSMSResponse> {
    if (!SEMAPHORE_API_KEY) {
        console.error('SEMAPHORE_API_KEY is not configured');
        return { success: false, error: 'SMS service not configured' };
    }

    const formattedNumber = formatPhoneNumber(to);

    try {
        const requestBody = {
            apikey: SEMAPHORE_API_KEY,
            number: formattedNumber,
            message: message,
            sendername: SEMAPHORE_SENDER_NAME,
        };

        const response = await fetch('https://api.semaphore.co/api/v4/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        const responseText = await response.text();

        let data;
        try {
            data = JSON.parse(responseText);
        } catch {
            return {
                success: false,
                error: `Invalid JSON response: ${responseText.substring(0, 200)}`,
            };
        }

        // Check for error in response
        if (data.error) {
            return {
                success: false,
                error: typeof data.error === 'string' ? data.error : JSON.stringify(data.error),
            };
        }

        // Check for success response format
        if (response.ok && Array.isArray(data) && data.length > 0 && data[0].message_id) {
            return {
                success: true,
                messageId: data[0].message_id,
            };
        }

        // Handle other response formats
        if (response.ok && data.message_id) {
            return {
                success: true,
                messageId: data.message_id,
            };
        }

        return {
            success: false,
            error: `Unexpected response: ${JSON.stringify(data).substring(0, 200)}`,
        };
    } catch (error) {
        console.error('Error sending SMS:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to send SMS',
        };
    }
}

/**
 * SMS Templates
 */
export const SMSTemplates = {
    invoiceGenerated: (customerName: string, amount: number, dueDate: string, businessUnit: string, unpaidBalance?: number) => {
        let message = `Hi ${customerName}!\n\n`;
        message += `Your ${businessUnit} internet bill is ready:\n\n`;
        
        if (unpaidBalance && unpaidBalance > 0) {
            const totalAmount = amount + unpaidBalance;
            message += `Total to Pay: P${totalAmount.toLocaleString()}\n`;
            message += `Due Date: ${dueDate}\n\n`;
            message += `Bill: P${amount.toLocaleString()}\n`;
            message += `Outstanding Balance: P${unpaidBalance.toLocaleString()}\n`;
        } else {
            message += `Amount: P${amount.toLocaleString()}\n`;
            message += `Due Date: ${dueDate}\n`;
        }
        
        message += `\nPlease pay on time to avoid disconnection.\n`;
        message += `Thank you! - Allstar`;
        
        return message;
    },

    dueDateReminder: (customerName: string, amount: number, dueDate: string) => {
        let message = `⏰ REMINDER\n\n`;
        message += `Hi ${customerName},\n\n`;
        message += `Your internet bill is due soon:\n`;
        message += `Amount: P${amount.toLocaleString()}\n`;
        message += `Due Date: ${dueDate}\n\n`;
        message += `Please settle to avoid service interruption.\n`;
        message += `Thank you! - Allstar`;
        
        return message;
    },

    disconnectionWarning: (customerName: string, disconnectionDate: string, unpaidAmount?: number) => {
        let message = `🚨 URGENT NOTICE\n\n`;
        message += `Hi ${customerName},\n\n`;
        message += `Your internet service will be disconnected on ${disconnectionDate} due to unpaid balance.\n`;
        
        if (unpaidAmount && unpaidAmount > 0) {
            message += `\nAmount Due: P${unpaidAmount.toLocaleString()}\n`;
        }
        
        message += `\nPlease pay immediately to continue service.\n`;
        message += `- Allstar`;
        
        return message;
    },

    serviceDisconnected: (customerName: string, businessUnit: string, totalAmount: number, outstandingBalance: number, proratedCharges: number) => {
        let message = `Hi ${customerName}!\n\n`;
        message += `Your ${businessUnit} internet service is currently disconnected due to an unpaid balance.\n\n`;
        message += `Amount to Reconnect: P${Math.round(totalAmount).toLocaleString()}`;
        
        if (outstandingBalance > 0 && proratedCharges > 0) {
            message += ` (Outstanding Balance: P${Math.round(outstandingBalance).toLocaleString()} + Pro-rated Charges: P${Math.round(proratedCharges).toLocaleString()})`;
        }
        
        message += `\n\nPlease settle this amount to restore your internet service.\n\n`;
        message += `Thank you! – Allstar`;
        
        return message;
    },

    paymentReceived: (customerName: string, amount: number, newBalance: number) => {
        let message = `✅ PAYMENT RECEIVED\n\n`;
        message += `Hi ${customerName}!\n\n`;
        message += `We received your payment:\n`;
        message += `Amount Paid: P${amount.toLocaleString()}\n\n`;
        
        if (newBalance > 0) {
            message += `Remaining Balance: P${newBalance.toLocaleString()}\n`;
        } else if (newBalance < 0) {
            message += `Credit Balance: P${Math.abs(newBalance).toLocaleString()}\n`;
        } else {
            message += `✓ Account Fully Paid\n`;
        }
        
        message += `\nThank you! - Allstar`;
        
        return message;
    },

    newSubscription: (customerName: string, planName: string, amount: number) => {
        let message = `🎉 WELCOME!\n\n`;
        message += `Hi ${customerName}!\n\n`;
        message += `Your subscription is now active:\n`;
        message += `Plan: ${planName}\n`;
        message += `Monthly Fee: P${amount.toLocaleString()}\n\n`;
        message += `Thank you for choosing Allstar!\n`;
        message += `- Allstar`;
        
        return message;
    },
};

/**
 * Batch send SMS to multiple recipients
 */
export async function sendBulkSMS(messages: SendSMSParams[]): Promise<{
    sent: number;
    failed: number;
    results: SendSMSResponse[];
}> {
    const results: SendSMSResponse[] = [];
    let sent = 0;
    let failed = 0;

    // Process in batches of 10 to avoid rate limiting
    const batchSize = 10;
    for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);

        const batchResults = await Promise.all(
            batch.map(msg => sendSMS(msg))
        );

        for (const result of batchResults) {
            results.push(result);
            if (result.success) {
                sent++;
            } else {
                failed++;
            }
        }

        // Add delay between batches to respect rate limits
        if (i + batchSize < messages.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return { sent, failed, results };
}
