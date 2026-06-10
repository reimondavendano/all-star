export type VerificationPaymentStatus = 'pending' | 'approved' | 'rejected';

function toDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getVerificationMonthWindow(baseDate = new Date()) {
    const startDate = new Date(baseDate.getFullYear(), baseDate.getMonth() - 11, 1);
    const endDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);

    return {
        startDate: toDateKey(startDate),
        endDate: toDateKey(endDate)
    };
}

function isPendingStatus(value?: string | null) {
    const normalizedValue = (value || '').trim().toLowerCase();
    return normalizedValue === 'pending' || normalizedValue === 'pending verification';
}

function hasPendingMarker(notes?: string | null) {
    const normalizedNotes = (notes || '').toLowerCase();
    return /\bpending verification\b|\bpending\b/.test(normalizedNotes);
}

export function getVerificationPaymentStatus(notes?: string | null, invoicePaymentStatus?: string | null): VerificationPaymentStatus {
    const normalizedNotes = (notes || '').toLowerCase();

    if (normalizedNotes.includes('rejected')) return 'rejected';
    if (normalizedNotes.includes('verified')) return 'approved';
    if (invoicePaymentStatus) return isPendingStatus(invoicePaymentStatus) ? 'pending' : 'approved';
    if (hasPendingMarker(notes)) return 'pending';

    return 'approved';
}

export function isPendingVerificationPayment(notes?: string | null, invoicePaymentStatus?: string | null) {
    return getVerificationPaymentStatus(notes, invoicePaymentStatus) === 'pending';
}
