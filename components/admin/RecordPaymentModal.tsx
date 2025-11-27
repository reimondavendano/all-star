import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Search, Check, User, Wifi, MoreHorizontal } from 'lucide-react';
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

export default function RecordPaymentModal({ isOpen, onClose, onSuccess }: RecordPaymentModalProps) {
    const [selectedSubscriber, setSelectedSubscriber] = useState<string>('');
    const [subscriberDetails, setSubscriberDetails] = useState<Subscriber | null>(null);
    const [amount, setAmount] = useState('');
    const [mode, setMode] = useState<'Cash' | 'E-Wallet'>('Cash');
    const [notes, setNotes] = useState('');
    const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSelectModalOpen, setIsSelectModalOpen] = useState(false);

    useEffect(() => {
        if (selectedSubscriber) {
            fetchSubscriberDetails();
        }
    }, [selectedSubscriber]);

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedSubscriber || !amount || !subscriberDetails) {
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
            // BALANCE CALCULATION LOGIC
            // ============================================
            // Formula: balance = (monthly_fee - payment) + previous_balance
            //
            // Scenarios:
            // 1. Full Payment: monthly=999, payment=999, prev=0
            //    → balance = (999-999) + 0 = 0 ✓
            //
            // 2. Partial Payment: monthly=999, payment=300, prev=0
            //    → balance = (999-300) + 0 = 699 (owes 699) ✓
            //
            // 3. Overpayment: monthly=999, payment=2000, prev=0
            //    → balance = (999-2000) + 0 = -1001 (credit 1001) ✓
            //
            // 4. Payment with existing balance: monthly=999, payment=999, prev=699
            //    → balance = (999-999) + 699 = 699 (still owes 699)
            //
            // 5. Full payment of debt: monthly=999, payment=1698, prev=699
            //    → balance = (999-1698) + 699 = 0 ✓
            // ============================================

            let newBalance = (monthlyFee - paymentAmount) + currentBalance;

            // Update subscription balance
            await supabase
                .from('subscriptions')
                .update({ balance: newBalance })
                .eq('id', selectedSubscriber);

            // Get the current month's invoice for this subscription
            const currentMonth = new Date().toISOString().slice(0, 7);
            const [year, month] = currentMonth.split('-');
            const startDate = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString().split('T')[0];
            const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

            const { data: invoices } = await supabase
                .from('invoices')
                .select('*')
                .eq('subscription_id', selectedSubscriber)
                .gte('due_date', startDate)
                .lte('due_date', endDate)
                .order('due_date', { ascending: true });

            // Update invoice payment status
            if (invoices && invoices.length > 0) {
                const invoice = invoices[0];
                let paymentStatus: 'Paid' | 'Unpaid' | 'Partially Paid' = 'Unpaid';

                // Check total payments for this invoice period
                const { data: allPayments } = await supabase
                    .from('payments')
                    .select('amount')
                    .eq('subscription_id', selectedSubscriber)
                    .gte('settlement_date', startDate)
                    .lte('settlement_date', endDate);

                const totalPaid = allPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

                if (totalPaid >= monthlyFee) {
                    // Full payment or overpayment
                    paymentStatus = 'Paid';
                } else if (totalPaid > 0 && totalPaid < monthlyFee) {
                    // Partial payment
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

                <div className="relative bg-[#0a0a0a] border-2 border-red-900/50 rounded-xl shadow-[0_0_50px_rgba(255,0,0,0.3)] w-full max-w-2xl">
                    <div className="p-6 border-b border-red-900/30 flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-white neon-text">Record Payment</h2>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-6">
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
                                disabled={isLoading || !selectedSubscriber || !amount}
                                className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${isLoading || !selectedSubscriber || !amount
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
