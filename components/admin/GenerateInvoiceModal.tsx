'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Calendar, Building2, Users, ChevronDown, RefreshCw, Info } from 'lucide-react';

interface GenerateInvoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function GenerateInvoiceModal({ isOpen, onClose, onSuccess }: GenerateInvoiceModalProps) {
    const [businessUnits, setBusinessUnits] = useState<{ id: string; name: string }[]>([]);
    const [selectedUnit, setSelectedUnit] = useState<string>('');
    const [billingMonth, setBillingMonth] = useState(new Date().toISOString().slice(0, 7));
    const [cycleDate, setCycleDate] = useState<'15th' | '30th'>('15th');
    const [eligibleSubs, setEligibleSubs] = useState<number>(0);
    const [totalSubs, setTotalSubs] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(false);
    const [isCalculating, setIsCalculating] = useState(false);
    const [subsWithBalances, setSubsWithBalances] = useState<any[]>([]);
    const [debugInfo, setDebugInfo] = useState<string>('');

    useEffect(() => {
        if (isOpen) {
            fetchBusinessUnits();
        }
    }, [isOpen]);

    useEffect(() => {
        if (selectedUnit && billingMonth && cycleDate) {
            checkEligibleSubscriptions();
        }
    }, [selectedUnit, billingMonth, cycleDate]);

    // Auto-select cycle date based on business unit
    useEffect(() => {
        if (selectedUnit) {
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

    const fetchBusinessUnits = async () => {
        const { data } = await supabase
            .from('business_units')
            .select('id, name')
            .order('name');
        setBusinessUnits(data || []);
        if (data && data.length > 0 && !selectedUnit) {
            setSelectedUnit(data[0].id);
        }
    };

    const checkEligibleSubscriptions = async () => {
        if (!selectedUnit) return;

        setIsCalculating(true);
        setDebugInfo('');
        try {
            // Fetch all subscriptions for the selected business unit
            const { data: subs, error } = await supabase
                .from('subscriptions')
                .select(`
                    id,
                    balance,
                    business_unit_id,
                    plans (
                        monthly_fee
                    )
                `)
                .eq('business_unit_id', selectedUnit);

            if (error) {
                setDebugInfo(`Error fetching subscriptions: ${error.message}`);
                throw error;
            }

            setTotalSubs(subs?.length || 0);

            if (!subs || subs.length === 0) {
                // Diagnostic check
                const { count: totalCount } = await supabase
                    .from('subscriptions')
                    .select('*', { count: 'exact', head: true });

                if (totalCount === 0) {
                    setDebugInfo('⚠️ No subscriptions found in database. Please add subscriptions first.');
                } else {
                    setDebugInfo(`⚠️ Found ${totalCount} subscriptions total, but 0 for Business Unit ID: ${selectedUnit}. Business Unit IDs may be mismatched after truncating/re-seeding data.`);
                }
            }

            // Check which ones already have an invoice for this month
            const [year, month] = billingMonth.split('-');
            const startDate = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString().split('T')[0];
            const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

            const { data: existingInvoices } = await supabase
                .from('invoices')
                .select('subscription_id')
                .gte('due_date', startDate)
                .lte('due_date', endDate);

            const invoicedIds = new Set(existingInvoices?.map(i => i.subscription_id));

            // Filter out already invoiced subscriptions
            const eligible = (subs || []).filter(s => !invoicedIds.has(s.id));
            setEligibleSubs(eligible.length);
            setSubsWithBalances(eligible);

        } catch (error) {
            console.error('Error checking eligibility:', error);
        } finally {
            setIsCalculating(false);
        }
    };

    const handleGenerate = async () => {
        setIsLoading(true);
        try {
            const [year, month] = billingMonth.split('-');
            const yearInt = parseInt(year);
            const monthInt = parseInt(month); // 1-12

            // Calculate dates based on cycle
            let fromDate, toDate, dueDate;

            if (cycleDate === '15th') {
                // 15th Cycle: Oct 15 - Nov 15 (for Nov)
                dueDate = new Date(yearInt, monthInt - 1, 15);
                toDate = new Date(yearInt, monthInt - 1, 15);
                fromDate = new Date(yearInt, monthInt - 2, 15);
            } else {
                // 30th Cycle: Nov 1 - Nov 30 (for Nov)
                const lastDayOfMonth = new Date(yearInt, monthInt, 0).getDate();
                const dueDay = Math.min(30, lastDayOfMonth);

                dueDate = new Date(yearInt, monthInt - 1, dueDay);
                toDate = new Date(yearInt, monthInt - 1, dueDay);

                // From Date: 1st of selected month
                fromDate = new Date(yearInt, monthInt - 1, 1);
            }

            // Adjust for timezone offset to ensure YYYY-MM-DD is correct local date
            const toLocalISO = (date: Date) => {
                const offset = date.getTimezoneOffset() * 60000;
                return new Date(date.getTime() - offset).toISOString().split('T')[0];
            };

            const invoices = [];
            const subscriptionUpdates = [];

            for (const sub of subsWithBalances) {
                let amountDue = sub.plans.monthly_fee;
                let currentBalance = Number(sub.balance) || 0;

                // Only apply if there is a credit (negative balance)
                if (currentBalance < 0) {
                    const credit = Math.abs(currentBalance);

                    if (credit >= amountDue) {
                        // Credit covers the entire plan amount
                        const originalAmountDue = amountDue;
                        amountDue = 0;
                        currentBalance = currentBalance + originalAmountDue;
                    } else {
                        // Credit is less than plan amount
                        amountDue = amountDue - credit;
                        currentBalance = 0;
                    }

                    subscriptionUpdates.push({
                        id: sub.id,
                        balance: currentBalance
                    });
                }

                invoices.push({
                    subscription_id: sub.id,
                    due_date: toLocalISO(dueDate),
                    from_date: toLocalISO(fromDate),
                    to_date: toLocalISO(toDate),
                    amount_due: amountDue,
                    payment_status: amountDue === 0 ? 'Paid' : 'Unpaid'
                });
            }

            if (invoices.length === 0) {
                alert('No eligible subscriptions to invoice.');
                return;
            }

            // Insert invoices
            const { error: insertError } = await supabase
                .from('invoices')
                .insert(invoices);

            if (insertError) throw insertError;

            // Update subscription balances if needed
            if (subscriptionUpdates.length > 0) {
                for (const update of subscriptionUpdates) {
                    const { error: updateError } = await supabase
                        .from('subscriptions')
                        .update({ balance: update.balance })
                        .eq('id', update.id);

                    if (updateError) {
                        console.error(`Failed to update balance for subscription ${update.id}`, updateError);
                    }
                }
            }

            onSuccess();

        } catch (error) {
            console.error('Error generating invoices:', error);
            alert('Failed to generate invoices. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleMonthChange = (newMonth: string) => {
        const [year] = billingMonth.split('-');
        setBillingMonth(`${year}-${newMonth}`);
    };

    const handleYearChange = (newYear: string) => {
        const [, month] = billingMonth.split('-');
        setBillingMonth(`${newYear}-${month}`);
    };

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, i) => currentYear - 1 + i);
    const months = [
        { value: '01', label: 'January' },
        { value: '02', label: 'February' },
        { value: '03', label: 'March' },
        { value: '04', label: 'April' },
        { value: '05', label: 'May' },
        { value: '06', label: 'June' },
        { value: '07', label: 'July' },
        { value: '08', label: 'August' },
        { value: '09', label: 'September' },
        { value: '10', label: 'October' },
        { value: '11', label: 'November' },
        { value: '12', label: 'December' },
    ];

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-[#111] border border-gray-800 rounded-xl w-full max-w-md p-6 shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold text-white">Generate Invoices</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-400">Business Unit</label>
                            <div className="relative">
                                <select
                                    value={selectedUnit}
                                    onChange={(e) => setSelectedUnit(e.target.value)}
                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-4 py-2 text-white appearance-none focus:border-blue-500 focus:outline-none"
                                >
                                    {businessUnits.map(unit => (
                                        <option key={unit.id} value={unit.id}>{unit.name}</option>
                                    ))}
                                </select>
                                <Building2 className="absolute right-3 top-2.5 w-4 h-4 text-gray-500 pointer-events-none" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-400">Billing Month</label>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="relative">
                                    <select
                                        value={billingMonth.split('-')[1]}
                                        onChange={(e) => handleMonthChange(e.target.value)}
                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-4 py-2 text-white appearance-none focus:border-blue-500 focus:outline-none"
                                    >
                                        {months.map(m => (
                                            <option key={m.value} value={m.value}>{m.label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-500 pointer-events-none" />
                                </div>
                                <div className="relative">
                                    <select
                                        value={billingMonth.split('-')[0]}
                                        onChange={(e) => handleYearChange(e.target.value)}
                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-4 py-2 text-white appearance-none focus:border-blue-500 focus:outline-none"
                                    >
                                        {years.map(y => (
                                            <option key={y} value={y}>{y}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-500 pointer-events-none" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-gray-400">Cycle Date</label>
                            <div className="group relative">
                                <Info className="w-4 h-4 text-gray-500 cursor-help" />
                                <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 bg-gray-800 text-xs text-gray-300 p-2 rounded shadow-lg z-10">
                                    Select the billing cycle for invoice generation.
                                </div>
                            </div>
                        </div>
                        <select
                            value={cycleDate}
                            onChange={(e) => setCycleDate(e.target.value as '15th' | '30th')}
                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                        >
                            <option value="15th">
                                15th (Gen: 10th, Due: 15th, Disc: 20th)
                            </option>
                            <option value="30th">
                                30th (Gen: 25th, Due: 30th, Disc: 5th)
                            </option>
                        </select>
                    </div>

                    <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-400">Eligible Subscriptions</span>
                            <button
                                onClick={checkEligibleSubscriptions}
                                className="text-gray-500 hover:text-white transition-colors"
                                title="Refresh"
                            >
                                <RefreshCw className={`w-4 h-4 ${isCalculating ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold text-white">{eligibleSubs}</span>
                            <span className="text-sm text-gray-500">/ {totalSubs}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            {eligibleSubs} subscriptions ready for invoicing. {totalSubs - eligibleSubs} already invoiced.
                        </p>
                        {debugInfo && (
                            <div className="mt-3 p-3 bg-yellow-900/20 border border-yellow-700/50 rounded text-xs text-yellow-400">
                                {debugInfo}
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={isLoading || eligibleSubs === 0}
                        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-800 disabled:text-gray-500 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Generating...
                            </>
                        ) : (
                            <>
                                <Users className="w-4 h-4" />
                                Generate Invoices
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
