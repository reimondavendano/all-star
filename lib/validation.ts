/**
 * Validation Utilities for AllStar System
 */

/**
 * Validate Philippine mobile number format
 * - Must start with 09
 * - Must be exactly 11 digits
 */
export function validatePhilippineMobileNumber(number: string): {
    isValid: boolean;
    error?: string;
} {
    // Remove any spaces or dashes
    const cleaned = number.replace(/[\s-]/g, '');

    if (!cleaned) {
        return { isValid: false, error: 'Mobile number is required' };
    }

    if (!/^\d+$/.test(cleaned)) {
        return { isValid: false, error: 'Mobile number must contain only digits' };
    }

    if (!cleaned.startsWith('09')) {
        return { isValid: false, error: 'Mobile number must start with 09' };
    }

    if (cleaned.length !== 11) {
        return { isValid: false, error: 'Mobile number must be exactly 11 digits' };
    }

    return { isValid: true };
}

/**
 * Format mobile number for display (add dashes)
 */
export function formatMobileNumber(number: string): string {
    const cleaned = number.replace(/[\s-]/g, '');
    if (cleaned.length === 11) {
        return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return cleaned;
}

/**
 * Round up balance to whole number
 */
export function roundUpBalance(balance: number): number {
    if (balance === 0) return 0;
    // Round up for positive, round down for negative (credits)
    return balance > 0 ? Math.ceil(balance) : Math.floor(balance);
}

/**
 * Format balance as whole number with peso sign
 */
export function formatWholeBalance(balance: number): string {
    const rounded = roundUpBalance(balance);
    return `₱${Math.abs(rounded).toLocaleString()}`;
}

/**
 * Generate month options for dashboard period picker
 * Returns last 12 months plus current month
 */
export function generateMonthOptions(): { value: string; label: string }[] {
    const options: { value: string; label: string }[] = [];
    const now = new Date();

    // Generate last 12 months
    for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthName = date.toLocaleString('default', { month: 'long' });
        const year = date.getFullYear();
        const value = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        options.push({
            value,
            label: `${monthName} ${year}`
        });
    }

    return options;
}

/**
 * Get default billing period based on business unit name
 */
export function getDefaultBillingPeriod(businessUnitName: string): '15th' | '30th' {
    const normalized = businessUnitName.toLowerCase().trim();

    if (normalized.includes('malanggam')) {
        return '30th';
    }

    // Bulihan, Extension, and others default to 15th
    return '15th';
}

/**
 * Validate installation date based on prospect status
 * - Closed Won: Must not be a future date (past or today)
 * - Open: Must be a future date
 */
export function validateInstallationDate(
    dateStr: string,
    status: 'Open' | 'Closed Won' | 'Closed Lost'
): { isValid: boolean; error?: string } {
    if (!dateStr) {
        return { isValid: false, error: 'Installation date is required' };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const installDate = new Date(dateStr);
    installDate.setHours(0, 0, 0, 0);

    if (status === 'Closed Won') {
        // For Closed Won: Installation date must NOT be in the future
        if (installDate > today) {
            return { isValid: false, error: 'Installation date cannot be in the future for Closed Won status' };
        }
    } else if (status === 'Open') {
        // For Open: Installation date must be in the future
        if (installDate <= today) {
            return { isValid: false, error: 'Installation date must be a future date for Open status' };
        }
    }

    return { isValid: true };
}

/**
 * Check if subscription installation date is eligible for invoice generation
 * - Only subscriptions installed on or before the 15th should be eligible for that billing period
 */
export function isEligibleForInvoiceGeneration(
    dateInstalled: Date,
    billingCycleDay: number // 15 or 30
): boolean {
    const installDay = dateInstalled.getDate();
    return installDay <= billingCycleDay;
}
