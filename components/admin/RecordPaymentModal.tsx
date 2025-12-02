import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Search, Check, User, Wifi, MoreHorizontal, Calendar } from 'lucide-react';
import SubscriberSelectModal from './SubscriberSelectModal';

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
}

export default function RecordPaymentModal({ isOpen, onClose, onSuccess }: RecordPaymentModalProps) {
    const [selectedSubscriber, setSelectedSubscriber] = useState<string>('');
    const [subscriberDetails, setSubscriberDetails] = useState<Subscriber | null>(null);
    const [availableInvoices, setAvailableInvoices] = useState<AvailableInvoice[]>([]);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
    const [amount, setAmount] = useState('');
    const [mode, setMode] = useState<'Cash' | 'E-Wallet'>('Cash');
    const [notes, setNotes] = useState('');
    const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSelectModalOpen, setIsSelectModalOpen] = useState(false);
    const [suggestedAmount, setSuggestedAmount] = useState<{
        amount: number;
        invoiceAmount: number;
        balance: number;
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
    }, [selectedInvoiceId, subscriberDetails]);

    // Reset form when modal is closed
    useEffect(() => {
        if (!isOpen) {
            setSelectedSubscriber('');
            setSubscriberDetails(null);
            setAvailableInvoices([]);
            setSelectedInvoiceId('');
            setAmount('');
            setMode('Cash');
            setNotes('');
            setSettlementDate(new Date().toISOString().split('T')[0]);
            setSuggestedAmount(null);
        }
    }, [isOpen]);

    const fetchSubscriberDetails = async () => {
        try {
            console.log('Fetching details for subscription:', selectedSubscriber);
            const { data, error } = await supabase
                .from('subscriptions')
                .select(`
                    id,
                    subscriber_id,
                    balance,
                    referral_credit_applied,

                    customers (
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

            if (error) {
                console.error('Supabase error:', error);
                throw error;
            }

            console.log('Fetched subscriber data:', data);
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
                .select('id, due_date, amount_due, payment_status')
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

            // Logic: Payable = Invoice Amount + Balance
            // If Balance is negative (credit), it reduces the payable amount.
            // If Balance is positive (debt), it increases the payable amount.
            const totalAmount = Math.max(0, invoiceAmount + currentBalance);

            setSuggestedAmount({
                amount: totalAmount,
                invoiceAmount: invoiceAmount,
                balance: currentBalance
            });

            // Auto-set settlement date to the invoice's due date
            setSettlementDate(selectedInvoice.due_date);
        } catch (error) {
            console.error('Error calculating suggested amount:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

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
            const monthlyFee = subscriberDetails.plans.monthly_fee;
            const currentBalance = Number(subscriberDetails.balance) || 0;

            // Insert payment record
            const { error: paymentError } = await supabase
                .from('payments')
                .insert({
                    subscription_id: selectedSubscriber,
                    amount: paymentAmount,
                    mode: mode,
                    notes: notes || null,
                    settlement_date: settlementDate
                });

            if (paymentError) throw paymentError;

            // ============================================
            // NEW BALANCE & INVOICE LOGIC
            // ============================================

            // 1. Find the invoice for the settlement month
            const [year, month] = settlementDate.split('-');
            const startDate = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString().split('T')[0];
            const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

            const { data: invoices } = await supabase
                .from('invoices')
                .select('*')
                .eq('subscription_id', selectedSubscriber)
                .gte('due_date', startDate)
                .lte('due_date', endDate)
                .order('due_date', { ascending: true });

            const invoice = invoices && invoices.length > 0 ? invoices[0] : null;
            const invoiceAmount = invoice ? invoice.amount_due : 0;

            // 2. Calculate Total Payments for this month/invoice
            const { data: allPayments } = await supabase
                .from('payments')
                .select('amount')
                .eq('subscription_id', selectedSubscriber)
                .gte('settlement_date', startDate)
                .lte('settlement_date', endDate);

            const totalPaid = allPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

            // 3. Calculate New Balance
            // We need to isolate "AdHoc" adjustments (like referrals) from the invoice debt.
            // If this is the first payment (totalPaid approx equals paymentAmount), AdHoc is just the current balance.
            // If subsequent, we reverse the previous invoice-debt effect to find AdHoc.

            let adHocBalance = currentBalance;

            // If we have an invoice (or treating 0 as invoice) and this is NOT the first payment
            if (Math.abs(totalPaid - paymentAmount) > 0.01) {
                const previousTotalPaid = totalPaid - paymentAmount;
                const previousRemainingDebt = invoiceAmount - previousTotalPaid;
                adHocBalance = currentBalance - previousRemainingDebt;
            }

            // New Balance = (InvoiceDebt - TotalPaid) + AdHoc
            // If no invoice, InvoiceDebt is 0.
            const newBalance = (invoiceAmount - totalPaid) + adHocBalance;

            // Update subscription balance
            await supabase
                .from('subscriptions')
                .update({ balance: newBalance })
                .eq('id', selectedSubscriber);

            // 4. Update Invoice Status
            if (invoice) {
                let paymentStatus: 'Paid' | 'Unpaid' | 'Partially Paid' = 'Unpaid';

                // We compare Total Paid against Invoice Amount
                if (totalPaid >= invoiceAmount) {
                    paymentStatus = 'Paid';
                } else if (totalPaid > 0) {
                    paymentStatus = 'Partially Paid';
                }

                await supabase
                    .from('invoices')
                    .update({ payment_status: paymentStatus })
                    .eq('id', invoice.id);
            }

            // Reset form
            setSelectedSubscriber('');
            setSubscriberDetails(null);
            setAvailableInvoices([]);
            setSelectedInvoiceId('');
            setAmount('');
            setMode('Cash');
            setNotes('');
            setSettlementDate(new Date().toISOString().split('T')[0]);

            onSuccess();
            onClose();
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

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

                <div className="relative bg-[#0a0a0a] border-2 border-red-900/50 rounded-xl shadow-[0_0_50px_rgba(255,0,0,0.3)] w-full max-w-2xl max-h-[90vh] flex flex-col">
                    <div className="p-6 border-b border-red-900/30 flex justify-between items-center flex-shrink-0">
                        <h2 className="text-2xl font-bold text-white neon-text">Record Payment</h2>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1">
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
                                            <div className="mt-2 text-sm">
                                                <span className="text-gray-500">Current Balance: </span>
                                                <span className={`font-medium ${(subscriberDetails.balance || 0) > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                                    ₱{(subscriberDetails.balance || 0).toLocaleString()}
                                                </span>
                                            </div>

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
                                    Select Invoice Month <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={selectedInvoiceId}
                                    onChange={(e) => setSelectedInvoiceId(e.target.value)}
                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-3 text-white focus:outline-none focus:border-red-500"
                                >
                                    <option value="">Select an invoice month</option>
                                    {availableInvoices
                                        .filter(inv => inv.payment_status === 'Unpaid') // Only show Unpaid invoices
                                        .map((inv) => (
                                            <option key={inv.id} value={inv.id}>
                                                {inv.month_label} - {subscriberDetails?.plans?.name || 'Plan'} ({inv.payment_status})
                                            </option>
                                        ))}
                                </select>
                            </div>
                        )}

                        {selectedSubscriber && availableInvoices.length > 0 && availableInvoices.filter(inv => inv.payment_status === 'Unpaid').length === 0 && (
                            <div className="text-center py-4 text-yellow-400 bg-yellow-900/20 border border-yellow-700/50 rounded">
                                No unpaid invoices available for this subscriber.
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
                                {/* Payment Mode */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        Payment Mode <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={mode}
                                        onChange={(e) => setMode(e.target.value as any)}
                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-3 text-white focus:outline-none focus:border-red-500"
                                    >
                                        <option value="Cash">Cash</option>
                                        <option value="E-Wallet">E-Wallet</option>
                                    </select>
                                </div>

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
                                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-3 pl-8 text-white focus:outline-none focus:border-red-500"
                                        />
                                    </div>
                                    {suggestedAmount && (
                                        <div className="mt-2 text-xs text-gray-400 bg-gray-900/50 p-2 rounded border border-gray-800">
                                            <div className="flex justify-between items-center mb-1">
                                                <span>Amount Total:</span>
                                                <span className="font-bold text-white">₱{suggestedAmount.amount.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-[10px] text-gray-500">
                                                <span>Breakdown:</span>
                                                <span>
                                                    Invoice (₱{suggestedAmount.invoiceAmount.toLocaleString()})
                                                    {suggestedAmount.balance >= 0 ? ' + ' : ' - '}
                                                    {suggestedAmount.balance >= 0 ? 'Debt' : 'Credit'} (₱{Math.abs(suggestedAmount.balance).toLocaleString()})
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setAmount(suggestedAmount.amount.toString())}
                                                className="mt-1 text-[10px] text-blue-400 hover:text-blue-300 underline"
                                            >
                                                Use Suggested Amount
                                            </button>
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
                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-3 text-white focus:outline-none focus:border-red-500"
                                    />
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
                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-3 text-white focus:outline-none focus:border-red-500 resize-none"
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
                                type="submit"
                                disabled={isLoading || !selectedSubscriber || !amount || !selectedInvoiceId}
                                className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${isLoading || !selectedSubscriber || !amount || !selectedInvoiceId
                                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                    : 'bg-green-600 hover:bg-green-700 text-white'
                                    }`}
                            >
                                {isLoading ? (
                                    <>Processing...</>
                                ) : (
                                    <>
                                        <Check className="w-5 h-5" />
                                        Record Payment
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <SubscriberSelectModal
                isOpen={isSelectModalOpen}
                onClose={() => setIsSelectModalOpen(false)}
                onSelect={handleSubscriberSelect}
            />
        </>
    );
}
