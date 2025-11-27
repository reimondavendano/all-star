import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Calendar, Check, Loader2 } from 'lucide-react';

interface GenerateInvoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface BusinessUnit {
    id: string;
    name: string;
}

export default function GenerateInvoiceModal({ isOpen, onClose, onSuccess }: GenerateInvoiceModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [selectedUnit, setSelectedUnit] = useState<string>('');
    const [cycleDate, setCycleDate] = useState<'15th' | '30th'>('15th');
    const [billingMonth, setBillingMonth] = useState(new Date().toISOString().slice(0, 7));
    const [eligibleSubscriptions, setEligibleSubscriptions] = useState<any[]>([]);
    const [isFetchingSubs, setIsFetchingSubs] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchBusinessUnits();
        }
    }, [isOpen]);

    useEffect(() => {
        if (selectedUnit && businessUnits.length > 0) {
            const unit = businessUnits.find(u => u.id === selectedUnit);
            if (unit) {
                const name = unit.name.toLowerCase();
                if (name.includes('bulihan') || name.includes('extension')) {
                    setCycleDate('15th');
                } else if (name.includes('malanggam')) {
                    setCycleDate('30th');
                }
            }
        }
    }, [selectedUnit, businessUnits]);

    useEffect(() => {
        if (selectedUnit && cycleDate && billingMonth) {
            fetchEligibleSubscriptions();
        } else {
            setEligibleSubscriptions([]);
        }
    }, [selectedUnit, cycleDate, billingMonth]);

    const fetchBusinessUnits = async () => {
        const { data } = await supabase.from('business_units').select('id, name').order('name');
        setBusinessUnits(data || []);
    };

    const fetchEligibleSubscriptions = async () => {
        setIsFetchingSubs(true);
        try {
            const { data, error } = await supabase
                .from('subscriptions')
                .select(`
                    id,
                    customers (name),
                    plans (name, monthly_fee),
                    invoice_date
                `)
                .eq('business_unit_id', selectedUnit)
                .eq('invoice_date', cycleDate)
                .eq('active', true);

            if (error) throw error;

            const [year, month] = billingMonth.split('-');
            const startDate = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString();
            const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString();

            const subsWithStatus = await Promise.all((data || []).map(async (sub: any) => {
                const { data: existingInvoice } = await supabase
                    .from('invoices')
                    .select('id')
                    .eq('subscription_id', sub.id)
                    .gte('due_date', startDate)
                    .lte('due_date', endDate)
                    .maybeSingle();

                return {
                    ...sub,
                    hasInvoice: !!existingInvoice
                };
            }));

            setEligibleSubscriptions(subsWithStatus);
        } catch (error) {
            console.error('Error fetching subscriptions:', error);
        } finally {
            setIsFetchingSubs(false);
        }
    };

    const handleGenerate = async () => {
        setIsLoading(true);
        try {
            const subsToInvoice = eligibleSubscriptions.filter(s => !s.hasInvoice);
            if (subsToInvoice.length === 0) {
                alert('No eligible subscriptions to invoice.');
                return;
            }

            const [year, month] = billingMonth.split('-');
            const day = cycleDate === '15th' ? 15 : 30;
            const lastDayOfMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
            const dueDay = Math.min(day, lastDayOfMonth);

            const dueDate = new Date(parseInt(year), parseInt(month) - 1, dueDay);
            const toDate = dueDate;
            const fromDate = new Date(dueDate);
            fromDate.setMonth(fromDate.getMonth() - 1);

            // Fetch current balances from subscriptions table
            const subsWithBalances = await Promise.all(subsToInvoice.map(async (sub) => {
                const { data: subData } = await supabase
                    .from('subscriptions')
                    .select('balance')
                    .eq('id', sub.id)
                    .single();
                return { ...sub, currentBalance: subData?.balance || 0 };
            }));

            // ============================================
            // INVOICE GENERATION WITH BALANCE LOGIC
            // ============================================
            // 
            // The previous balance is added to the monthly fee to get amount_due
            // Then we reset the balance to 0 (fresh start for new month)
            //
            // Example scenarios:
            // 1. Nov: monthly=999, paid=300 → balance=699
            //    Dec Invoice: amount_due = 999 + 699 = 1698
            //    Dec Balance: reset to 0 (will be updated when payment is made)
            //
            // 2. Nov: monthly=999, paid=1200 → balance=-201 (credit)
            //    Dec Invoice: amount_due = 999 + (-201) = 798
            //    Dec Balance: reset to 0
            //
            // 3. Nov: monthly=999, paid=0 → balance=999
            //    Dec Invoice: amount_due = 999 + 999 = 1998
            //    Dec Balance: reset to 0
            // ============================================

            const invoices = subsWithBalances.map(sub => {
                let amountDue = sub.plans.monthly_fee + sub.currentBalance;

                // Ensure amount doesn't go below 0
                if (amountDue < 0) amountDue = 0;

                return {
                    subscription_id: sub.id,
                    due_date: dueDate.toISOString().split('T')[0],
                    from_date: fromDate.toISOString().split('T')[0],
                    to_date: toDate.toISOString().split('T')[0],
                    amount_due: amountDue,
                    payment_status: 'Unpaid'
                };
            });

            const { error } = await supabase.from('invoices').insert(invoices);
            if (error) throw error;

            // Reset all subscription balances to 0 after generating invoices
            // The balance from previous month is now included in the invoice amount_due
            const subscriptionIds = subsToInvoice.map(s => s.id);
            await supabase
                .from('subscriptions')
                .update({ balance: 0 })
                .in('id', subscriptionIds);

            onSuccess();
            onClose();
        } catch (error) {
            console.error('Error generating invoices:', error);
            alert('Failed to generate invoices');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    const subsToInvoiceCount = eligibleSubscriptions.filter(s => !s.hasInvoice).length;
    const isReadyToGenerate = selectedUnit && billingMonth && subsToInvoiceCount > 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-[#0a0a0a] border border-gray-800 rounded-xl w-full max-w-lg flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">Generate Invoices</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-400">Business Unit</label>
                            <select
                                value={selectedUnit}
                                onChange={(e) => setSelectedUnit(e.target.value)}
                                className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                            >
                                <option value="">Select Unit</option>
                                {businessUnits.map(u => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-400">Billing Month</label>
                            <input
                                type="month"
                                value={billingMonth}
                                onChange={(e) => setBillingMonth(e.target.value)}
                                className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-400">Cycle (Due Date)</label>
                        <div className="flex gap-4">
                            <button
                                type="button"
                                onClick={() => setCycleDate('15th')}
                                disabled={!!(selectedUnit && businessUnits.find(u => u.id === selectedUnit)?.name.toLowerCase().includes('malanggam'))}
                                className={`flex-1 py-2 rounded-lg border transition-colors ${cycleDate === '15th'
                                        ? 'bg-blue-600 border-blue-600 text-white'
                                        : selectedUnit && businessUnits.find(u => u.id === selectedUnit)?.name.toLowerCase().includes('malanggam')
                                            ? 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed'
                                            : 'bg-[#1a1a1a] border-gray-800 text-gray-400 hover:border-gray-700'
                                    }`}
                            >
                                15th
                                {selectedUnit && (businessUnits.find(u => u.id === selectedUnit)?.name.toLowerCase().includes('bulihan') || businessUnits.find(u => u.id === selectedUnit)?.name.toLowerCase().includes('extension')) && (
                                    <span className="ml-2 text-xs text-blue-400">(Auto)</span>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={() => setCycleDate('30th')}
                                disabled={!!(selectedUnit && (businessUnits.find(u => u.id === selectedUnit)?.name.toLowerCase().includes('bulihan') || businessUnits.find(u => u.id === selectedUnit)?.name.toLowerCase().includes('extension')))}
                                className={`flex-1 py-2 rounded-lg border transition-colors ${cycleDate === '30th'
                                        ? 'bg-blue-600 border-blue-600 text-white'
                                        : selectedUnit && (businessUnits.find(u => u.id === selectedUnit)?.name.toLowerCase().includes('bulihan') || businessUnits.find(u => u.id === selectedUnit)?.name.toLowerCase().includes('extension'))
                                            ? 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed'
                                            : 'bg-[#1a1a1a] border-gray-800 text-gray-400 hover:border-gray-700'
                                    }`}
                            >
                                30th
                                {selectedUnit && businessUnits.find(u => u.id === selectedUnit)?.name.toLowerCase().includes('malanggam') && (
                                    <span className="ml-2 text-xs text-blue-400">(Auto)</span>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-gray-400">Eligible Subscriptions</span>
                            {isFetchingSubs && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                        </div>
                        <div className="text-2xl font-bold text-white">{subsToInvoiceCount} <span className="text-sm font-normal text-gray-500">/ {eligibleSubscriptions.length}</span></div>
                        <p className="text-xs text-gray-500 mt-1">
                            {subsToInvoiceCount} subscriptions ready for invoicing. {eligibleSubscriptions.length - subsToInvoiceCount} already invoiced.
                        </p>
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={isLoading || !isReadyToGenerate}
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Generating...
                            </>
                        ) : (
                            <>
                                <Check className="w-5 h-5" />
                                Generate Invoices
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
