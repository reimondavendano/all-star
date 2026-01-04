import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Search, Check, User, Wifi, MoreHorizontal, Calendar, Info, AlertCircle, CheckCircle } from 'lucide-react';
import SubscriberSelectModal from './SubscriberSelectModal';
import { formatBalanceDisplay, determinePaymentStatus } from '@/lib/billing';

interface RecordPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface Subscriber {
    id: string;
    subscriber_id: string;
    customers: {
        name: string;
        mobile_number: string;
    };
    plans: {
        name: string;
        monthly_fee: number;
    };
    business_units: {
        name: string;
    };
    balance?: number;
    referral_credit_applied?: boolean;
}

interface AvailableInvoice {
    id: string;
    due_date: string;
    amount_due: number;
    payment_status: string;
    month_label: string;
    is_prorated?: boolean;
    prorated_days?: number;
}

export default function RecordPaymentModal({ isOpen, onClose, onSuccess }: RecordPaymentModalProps) {
    const [selectedSubscriber, setSelectedSubscriber] = useState<string>('');
    const [subscriberDetails, setSubscriberDetails] = useState<Subscriber | null>(null);
    const [availableInvoices, setAvailableInvoices] = useState<AvailableInvoice[]>([]);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
    const [amount, setAmount] = useState('');
    const [notes, setNotes] = useState('');
    const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSelectModalOpen, setIsSelectModalOpen] = useState(false);
    const [sendSms, setSendSms] = useState(true);
    const [suggestedAmount, setSuggestedAmount] = useState<{
        amount: number;
        invoiceAmount: number;
        balance: number;
        isAdvancePayment: boolean;
    } | null>(null);
    const [paymentResult, setPaymentResult] = useState<{
        success: boolean;
        newBalance: number;
        previousBalance: number;
        status: string;
    } | null>(null);

    useEffect(() => {
        if (selectedSubscriber) {
            fetchSubscriberDetails();
            fetchAvailableInvoices();
        } else {
            setSubscriberDetails(null);
            setAvailableInvoices([]);
            setSelectedInvoiceId('');
        }
    }, [selectedSubscriber]);

    useEffect(() => {
        if (selectedInvoiceId && subscriberDetails) {
            calculateSuggestedAmount();
        } else {
            setSuggestedAmount(null);
        }
    }, [selectedInvoiceId, subscriberDetails, amount]);

    // Reset form when modal is closed
    useEffect(() => {
        if (!isOpen) {
            setSelectedSubscriber('');
            setSubscriberDetails(null);
            setAvailableInvoices([]);
            setSelectedInvoiceId('');
            setAmount('');
            setNotes('');
            setSettlementDate(new Date().toISOString().split('T')[0]);
            setSuggestedAmount(null);
            setPaymentResult(null);
        }
    }, [isOpen]);

    const fetchSubscriberDetails = async () => {
        try {
            const { data, error } = await supabase
                .from('subscriptions')
                .select(`
                    id,
                    subscriber_id,
                    balance,
                    referral_credit_applied,
                    customers!subscriptions_subscriber_id_fkey (
                        name,
                        mobile_number
                    ),
                    plans (
                        name,
                        monthly_fee
                    ),
                    business_units (
                        name
                    )
                `)
                .eq('id', selectedSubscriber)
                .single();

            if (error) throw error;
            setSubscriberDetails(data as any);
        } catch (error) {
            console.error('Error fetching subscriber details:', error);
            alert('Failed to fetch subscriber details. Please try again.');
        }
    };

    const fetchAvailableInvoices = async () => {
        try {
            const { data, error } = await supabase
                .from('invoices')
                .select('id, due_date, amount_due, payment_status, is_prorated, prorated_days')
                .eq('subscription_id', selectedSubscriber)
                .order('due_date', { ascending: false });

            if (error) throw error;

            const invoicesWithLabels = (data || []).map((inv: any) => {
                const dueDate = new Date(inv.due_date);
                const monthLabel = dueDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
                return {
                    ...inv,
                    month_label: monthLabel
                };
            });

            setAvailableInvoices(invoicesWithLabels);
        } catch (error) {
            console.error('Error fetching invoices:', error);
        }
    };

    const calculateSuggestedAmount = async () => {
        if (!selectedInvoiceId || !subscriberDetails) {
            setSuggestedAmount(null);
            return;
        }

        try {
            const selectedInvoice = availableInvoices.find(inv => inv.id === selectedInvoiceId);
            if (!selectedInvoice) return;

            const invoiceAmount = selectedInvoice.amount_due;
            const currentBalance = Number(subscriberDetails.balance) || 0;

            // Calculate total payable
            // If balance is positive (debt), add it
            // If balance is negative (credit), it's already applied to invoices
            const totalAmount = Math.max(0, invoiceAmount);

            // Check if entered amount exceeds invoice (advance payment)
            const enteredAmount = parseFloat(amount) || 0;
            const isAdvancePayment = enteredAmount > totalAmount;

            setSuggestedAmount({
                amount: Math.round(totalAmount),
                invoiceAmount: Math.round(invoiceAmount),
                balance: Math.round(currentBalance),
                isAdvancePayment,
            });

            // Auto-set settlement date to the invoice's due date
            setSettlementDate(selectedInvoice.due_date);
        } catch (error) {
            console.error('Error calculating suggested amount:', error);
        }
    };

    const handleProceed = (e: React.FormEvent) => {
        e.preventDefault();
        handleSubmit(e);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setPaymentResult(null);

        if (!selectedSubscriber || !amount || !subscriberDetails || !selectedInvoiceId) {
            alert('Please fill in all required fields');
            return;
        }

        const paymentAmount = parseFloat(amount);
        if (isNaN(paymentAmount) || paymentAmount <= 0) {
            alert('Please enter a valid payment amount');
            return;
        }

        setIsLoading(true);

        try {
            const currentBalance = Number(subscriberDetails.balance) || 0;

            // 1. Insert payment record
            const { data: payment, error: paymentError } = await supabase
                .from('payments')
                .insert({
                    subscription_id: selectedSubscriber,
                    amount: paymentAmount,
                    mode: 'Cash',
                    notes: notes || null,
                    settlement_date: settlementDate,
                    invoice_id: selectedInvoiceId
                })
                .select('id')
                .single();

            if (paymentError) throw paymentError;

            // 2. Calculate new balance
            // New Balance = Current Balance - Payment Amount
            const newBalance = currentBalance - paymentAmount;

            // 3. Update subscription balance
            await supabase
                .from('subscriptions')
                .update({ balance: newBalance })
                .eq('id', selectedSubscriber);

            // 4. Get all payments for this subscription to calculate invoice status
            const { data: allPayments } = await supabase
                .from('payments')
                .select('amount')
                .eq('subscription_id', selectedSubscriber);

            const totalPaid = allPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

            // 5. Get all invoices for this subscription
            const { data: allInvoices } = await supabase
                .from('invoices')
                .select('id, amount_due')
                .eq('subscription_id', selectedSubscriber);

            const totalInvoiced = allInvoices?.reduce((sum, i) => sum + Number(i.amount_due), 0) || 0;

            // 6. Update invoice status
            let paymentStatus: 'Paid' | 'Partially Paid' | 'Unpaid';
            if (totalPaid >= totalInvoiced) {
                paymentStatus = 'Paid';
            } else if (totalPaid > 0) {
                paymentStatus = 'Partially Paid';
            } else {
                paymentStatus = 'Unpaid';
            }

            await supabase
                .from('invoices')
                .update({ payment_status: paymentStatus })
                .eq('id', selectedInvoiceId);

            // 7. Log payment history (optional - for auditing)
            try {
                await supabase.from('payment_history').insert({
                    payment_id: payment.id,
                    subscription_id: selectedSubscriber,
                    customer_id: subscriberDetails.subscriber_id,
                    invoice_id: selectedInvoiceId,
                    amount: paymentAmount,
                    payment_mode: 'Cash',
                    status: 'recorded',
                    balance_before: currentBalance,
                    balance_after: newBalance,
                    notes: notes || null,
                });
            } catch (historyError) {
                // Payment history table may not exist yet, don't fail the whole transaction
                console.log('Payment history logging skipped:', historyError);
            }

            // Show result
            setPaymentResult({
                success: true,
                newBalance,
                previousBalance: currentBalance,
                status: paymentStatus,
            });

            // Refresh data
            fetchSubscriberDetails();
            fetchAvailableInvoices();

            // If successful, wait a moment then close
            setTimeout(() => {
                onSuccess();
            }, 2000);

        } catch (error) {
            console.error('Error recording payment:', error);
            alert('Failed to record payment. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubscriberSelect = (subscription: any) => {
        setSelectedSubscriber(subscription.id);
        setIsSelectModalOpen(false);
    };

    const getBalanceDisplay = () => {
        if (!subscriberDetails) return null;
        const balance = Number(subscriberDetails.balance) || 0;
        const display = formatBalanceDisplay(balance);
        return display;
    };

    const balanceDisplay = getBalanceDisplay();

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

                <div className="relative bg-[#0a0a0a] border-2 border-green-900/50 rounded-xl shadow-[0_0_50px_rgba(0,255,0,0.1)] w-full max-w-2xl max-h-[90vh] flex flex-col">
                    <div className="p-6 border-b border-green-900/30 flex justify-between items-center flex-shrink-0">
                        <h2 className="text-2xl font-bold text-white">Record Payment</h2>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <form onSubmit={(e) => e.preventDefault()} className="p-6 space-y-6 overflow-y-auto flex-1">

                        {/* Payment Result */}
                        {paymentResult && paymentResult.success && (
                            <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-4 flex items-start gap-3">
                                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                                <div>
                                    <div className="text-green-400 font-medium">Payment Recorded Successfully!</div>
                                    <div className="text-sm text-gray-400 mt-1">
                                        Invoice Status: <span className="text-white">{paymentResult.status}</span>
                                    </div>
                                    <div className="text-sm text-gray-400">
                                        New Balance: <span className={paymentResult.newBalance >= 0 ? 'text-white' : 'text-green-400'}>
                                            {paymentResult.newBalance >= 0
                                                ? `₱${paymentResult.newBalance.toLocaleString()}`
                                                : `₱${Math.abs(paymentResult.newBalance).toLocaleString()} (Credits)`
                                            }
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Subscriber Selection */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                Subscriber <span className="text-red-500">*</span>
                            </label>
                            <div className="flex gap-2">
                                <div className="flex-1 bg-[#1a1a1a] border border-gray-800 rounded px-4 py-3 text-white">
                                    {subscriberDetails && subscriberDetails.customers ? (
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <User className="w-4 h-4 text-blue-500" />
                                                <span className="font-medium">{subscriberDetails.customers?.name || 'Unknown'}</span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-1 text-sm text-gray-400">
                                                <Wifi className="w-3 h-3" />
                                                <span>{subscriberDetails.plans?.name || 'N/A'} - ₱{(subscriberDetails.plans?.monthly_fee || 0).toLocaleString()}</span>
                                            </div>
                                            {balanceDisplay && (
                                                <div className="mt-2 text-sm flex items-center gap-2">
                                                    <span className="text-gray-500">Current {balanceDisplay.label}:</span>
                                                    <span className={`font-medium ${balanceDisplay.label === 'Balance' ? 'text-red-400' : 'text-green-400'}`}>
                                                        {balanceDisplay.display}
                                                    </span>
                                                    {balanceDisplay.label === 'Credits' && (
                                                        <span className="text-xs text-green-600">(Advance Payment)</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-gray-500">No subscriber selected</span>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsSelectModalOpen(true)}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                                >
                                    <MoreHorizontal className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Invoice Month Selection */}
                        {selectedSubscriber && availableInvoices.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    <Calendar className="w-4 h-4 inline mr-2" />
                                    Select Invoice <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={selectedInvoiceId}
                                    onChange={(e) => setSelectedInvoiceId(e.target.value)}
                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-3 text-white focus:outline-none focus:border-green-500"
                                >
                                    <option value="">Select an invoice</option>
                                    {availableInvoices
                                        .filter(inv => inv.payment_status !== 'Paid')
                                        .map((inv) => (
                                            <option key={inv.id} value={inv.id}>
                                                {inv.month_label} - ₱{inv.amount_due.toLocaleString()} ({inv.payment_status})
                                                {inv.is_prorated && ` [Pro-rated: ${inv.prorated_days} days]`}
                                            </option>
                                        ))}
                                </select>
                            </div>
                        )}

                        {selectedSubscriber && availableInvoices.length > 0 && availableInvoices.filter(inv => inv.payment_status !== 'Paid').length === 0 && (
                            <div className="text-center py-4 text-green-400 bg-green-900/20 border border-green-700/50 rounded flex items-center justify-center gap-2">
                                <CheckCircle className="w-4 h-4" />
                                All invoices are fully paid!
                            </div>
                        )}

                        {selectedSubscriber && availableInvoices.length === 0 && (
                            <div className="text-center py-4 text-yellow-400 bg-yellow-900/20 border border-yellow-700/50 rounded">
                                No invoices available for this subscriber.
                            </div>
                        )}

                        {/* Payment Fields - Only show when invoice is selected */}
                        {selectedInvoiceId && (
                            <>
                                {/* Amount */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        Amount <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">₱</span>
                                        <input
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            step="0.01"
                                            min="0"
                                            placeholder="0.00"
                                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-3 pl-8 text-white focus:outline-none focus:border-green-500"
                                        />
                                    </div>

                                    {suggestedAmount && (
                                        <div className="mt-3 text-xs bg-gray-900/50 p-3 rounded border border-gray-800">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-gray-400">Invoice Amount:</span>
                                                <span className="font-bold text-white">₱{suggestedAmount.invoiceAmount.toLocaleString()}</span>
                                            </div>

                                            {suggestedAmount.balance !== 0 && (
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-gray-400">
                                                        {suggestedAmount.balance > 0 ? 'Outstanding Balance:' : 'Credits Available:'}
                                                    </span>
                                                    <span className={suggestedAmount.balance > 0 ? 'text-red-400' : 'text-green-400'}>
                                                        {suggestedAmount.balance > 0 ? '+' : '-'}₱{Math.abs(suggestedAmount.balance).toLocaleString()}
                                                    </span>
                                                </div>
                                            )}

                                            <div className="flex justify-between items-center pt-2 border-t border-gray-700">
                                                <span className="text-gray-300">Suggested Payment:</span>
                                                <span className="font-bold text-green-400">₱{suggestedAmount.amount.toLocaleString()}</span>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => setAmount(suggestedAmount.amount.toString())}
                                                className="mt-2 text-[10px] text-blue-400 hover:text-blue-300 underline"
                                            >
                                                Use Suggested Amount
                                            </button>

                                            {suggestedAmount.isAdvancePayment && (
                                                <div className="mt-2 flex items-center gap-1 text-[10px] text-green-400">
                                                    <Info className="w-3 h-3" />
                                                    This exceeds the invoice - excess will be saved as credits
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Settlement Date */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        Settlement Date <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        value={settlementDate}
                                        onChange={(e) => setSettlementDate(e.target.value)}
                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-3 text-white focus:outline-none focus:border-green-500"
                                    />
                                </div>

                                {/* SMS Notification Option */}
                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        id="sendPaymentSms"
                                        checked={sendSms}
                                        onChange={(e) => setSendSms(e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-green-500 focus:ring-green-500"
                                    />
                                    <label htmlFor="sendPaymentSms" className="text-sm text-gray-400">
                                        Send payment confirmation SMS
                                    </label>
                                </div>

                                {/* Notes */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        Notes (Optional)
                                    </label>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        rows={3}
                                        placeholder="Add any additional notes..."
                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-3 text-white focus:outline-none focus:border-green-500 resize-none"
                                    />
                                </div>
                            </>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-6 py-3 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                onClick={handleProceed}
                                disabled={isLoading || !selectedSubscriber || !amount || !selectedInvoiceId || paymentResult?.success}
                                className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${isLoading || !selectedSubscriber || !amount || !selectedInvoiceId || paymentResult?.success
                                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                    : 'bg-green-600 hover:bg-green-700 text-white'
                                    }`}
                            >
                                {isLoading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Processing...
                                    </>
                                ) : paymentResult?.success ? (
                                    <>
                                        <CheckCircle className="w-5 h-5" />
                                        Payment Recorded
                                    </>
                                ) : (
                                    <>
                                        <Check className="w-5 h-5" />
                                        Confirm Payment
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div >
            </div >

            <SubscriberSelectModal
                isOpen={isSelectModalOpen}
                onClose={() => setIsSelectModalOpen(false)}
                onSelect={handleSubscriberSelect}
            />
        </>
    );
}
