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

    console.log('=== Sending SMS ===');
    console.log('To:', formattedNumber);
    console.log('Message length:', message.length);

    try {
        const requestBody = {
            apikey: SEMAPHORE_API_KEY,
            number: formattedNumber,
            message: message,
            sendername: SEMAPHORE_SENDER_NAME,
        };

        console.log('Request body:', JSON.stringify({ ...requestBody, apikey: '***hidden***' }));

        const response = await fetch('https://api.semaphore.co/api/v4/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        const responseText = await response.text();
        console.log('Semaphore API Response Status:', response.status);
        console.log('Semaphore API Response:', responseText);

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
            console.log('SMS sent successfully! Message ID:', data[0].message_id);
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
    invoiceGenerated: (customerName: string, amount: number, dueDate: string, businessUnit: string) =>
        `Hi ${customerName}! Your ${businessUnit} internet bill of P${amount.toLocaleString()} is now ready. Due: ${dueDate}. Please pay on time to avoid disconnection. Thank you! - Allstar`,

    dueDateReminder: (customerName: string, amount: number, dueDate: string) =>
        `Reminder: Hi ${customerName}, your internet bill of P${amount.toLocaleString()} is due ${dueDate}. Please settle to avoid service interruption. Thank you! - Allstar`,

    disconnectionWarning: (customerName: string, disconnectionDate: string) =>
        `URGENT: Hi ${customerName}, your internet will be disconnected on ${disconnectionDate} due to unpaid balance. Please pay immediately to continue service. - Allstar`,

    paymentReceived: (customerName: string, amount: number, newBalance: number) =>
        `Hi ${customerName}! We received your payment of P${amount.toLocaleString()}. ${newBalance > 0 ? `Remaining balance: P${newBalance.toLocaleString()}.` : newBalance < 0 ? `You have P${Math.abs(newBalance).toLocaleString()} credits.` : 'Your account is fully paid.'} Thank you! - Allstar`,

    newSubscription: (customerName: string, planName: string, amount: number) =>
        `Welcome ${customerName}! Your ${planName} subscription is now active. Monthly fee: P${amount.toLocaleString()}. Thank you for choosing Allstar! - Allstar`,
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
