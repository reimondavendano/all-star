const SMS_CUSTOMER_PORTAL_BASE = 'allstar-kalibre.github.io/client-portal.github.io/index.html';

export function buildSmsCustomerPortalLink(customerId: string): string {
    return `${SMS_CUSTOMER_PORTAL_BASE}?customerid=${encodeURIComponent(customerId)}`;
}
