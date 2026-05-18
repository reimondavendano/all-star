import { buildSmsCustomerPortalLink } from '@/lib/portalLinks';

export type SmsDeliveryStatus = {
    type: 'success' | 'warning' | 'error';
    message: string;
};

type SendWelcomeSubscriptionSmsParams = {
    to?: string | null;
    customerId: string;
    customerName: string;
    planName: string;
    amount: number;
};

export async function sendWelcomeSubscriptionSms({
    to,
    customerId,
    customerName,
    planName,
    amount
}: SendWelcomeSubscriptionSmsParams): Promise<SmsDeliveryStatus> {
    const mobileNumber = to?.trim();

    if (!mobileNumber) {
        return {
            type: 'warning',
            message: 'Customer was created, but welcome SMS was not sent because no mobile number is saved.'
        };
    }

    try {
        const response = await fetch('/api/sms/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: mobileNumber,
                template: 'newSubscription',
                templateData: {
                    customerName,
                    planName,
                    amount,
                    portalLink: buildSmsCustomerPortalLink(customerId)
                }
            })
        });

        const responseText = await response.text();
        let result: { success?: boolean; error?: string; messageId?: string } | null = null;

        try {
            result = responseText ? JSON.parse(responseText) : null;
        } catch {
            result = null;
        }

        if (!response.ok || !result?.success) {
            const reason = result?.error || response.statusText || 'Unknown SMS error';
            return {
                type: 'warning',
                message: `Customer was created, but welcome SMS was not sent: ${reason}.`
            };
        }

        return {
            type: 'success',
            message: `Welcome SMS sent to ${mobileNumber}.`
        };
    } catch (error) {
        return {
            type: 'warning',
            message: `Customer was created, but welcome SMS was not sent: ${error instanceof Error ? error.message : 'Failed to contact SMS service'}.`
        };
    }
}
