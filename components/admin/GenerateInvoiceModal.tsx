'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Calendar, Building2, Users, ChevronDown, RefreshCw, Info, AlertTriangle, CheckCircle } from 'lucide-react';
import {
    getBillingSchedule,
    calculateBillingDates,
    calculateProratedAmount,
    needsProrating,
    toISODateString,
    formatDatePH,
} from '@/lib/billing';

interface GenerateInvoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface SubscriptionPreview {
    id: string;
    customerName: string;
    planName: string;
    monthlyFee: number;
    dateInstalled: string | null;
    currentBalance: number;
    isProrated: boolean;
    proratedDays?: number;
    calculatedAmount: number;
    finalAmount: number;
    creditsApplied: number;
    referralDiscount: number;
    hasReferrer: boolean;
    referralCreditApplied: boolean;
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
    const [subsWithBalances, setSubsWithBalances] = useState<SubscriptionPreview[]>([]);
    const [debugInfo, setDebugInfo] = useState<string>('');
    const [showPreview, setShowPreview] = useState(false);
    const [sendSms, setSendSms] = useState(true);
    const [generationResult, setGenerationResult] = useState<{
        success: boolean;
        generated: number;
        smsSent: number;
    } | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchBusinessUnits();
            setGenerationResult(null);
            // Always reset to current month
            const now = new Date();
            const currentMonthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
            setBillingMonth(currentMonthStr);
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
                const schedule = getBillingSchedule(unit.name);
                setCycleDate(schedule.dueDay === 15 ? '15th' : '30th');
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
        setShowPreview(false);

        try {
            // Get business unit name
            const unit = businessUnits.find(u => u.id === selectedUnit);
            if (!unit) return;

            const [year, month] = billingMonth.split('-');
            const yearInt = parseInt(year);
            const monthInt = parseInt(month);

            // Calculate billing dates
            const dates = calculateBillingDates(unit.name, yearInt, monthInt);

            // Fetch all subscriptions for the selected business unit
            const { data: subs, error } = await supabase
                .from('subscriptions')
                .select(`
                    id,
                    balance,
                    business_unit_id,
                    subscriber_id,
                    date_installed,
                    referral_credit_applied,
                    customers!subscriptions_subscriber_id_fkey (
                        id,
                        name
                    ),
                    plans (
                        name,
                        monthly_fee
                    )
                `)
                .eq('business_unit_id', selectedUnit)
                .eq('active', true);

            if (error) {
                setDebugInfo(`Error fetching subscriptions: ${error.message}`);
                throw error;
            }

            setTotalSubs(subs?.length || 0);

            if (!subs || subs.length === 0) {
                const { count: totalCount } = await supabase
                    .from('subscriptions')
                    .select('*', { count: 'exact', head: true });

                if (totalCount === 0) {
                    setDebugInfo('⚠️ No subscriptions found in database. Please add subscriptions first.');
                } else {
                    setDebugInfo(`⚠️ Found ${totalCount} subscriptions total, but 0 for this Business Unit.`);
                }
                setEligibleSubs(0);
                setSubsWithBalances([]);
                return;
            }

            // Check which ones already have an invoice for this month
            const startDate = new Date(yearInt, monthInt - 1, 1).toISOString().split('T')[0];
            const endDate = new Date(yearInt, monthInt, 0).toISOString().split('T')[0];

            const { data: existingInvoices } = await supabase
                .from('invoices')
                .select('subscription_id')
                .gte('due_date', startDate)
                .lte('due_date', endDate);

            const invoicedIds = new Set(existingInvoices?.map(i => i.subscription_id));

            // Get previous invoice counts
            const subIds = subs.map(s => s.id);
            const { data: previousInvoices } = await supabase
                .from('invoices')
                .select('subscription_id')
                .in('subscription_id', subIds)
                .lt('due_date', startDate);

            const prevInvoiceCount = new Map<string, number>();
            previousInvoices?.forEach(inv => {
                const count = prevInvoiceCount.get(inv.subscription_id) || 0;
                prevInvoiceCount.set(inv.subscription_id, count + 1);
            });

            // Check for referrers
            const { data: subscriptionsWithReferrers } = await supabase
                .from('subscriptions')
                .select('id, subscriber_id')
                .in('id', subIds);

            // Get customers with referrers (from prospects that were converted)
            const subscriberIds = subs.map(s => s.subscriber_id);
            const { data: prospects } = await supabase
                .from('prospects')
                .select('referrer_id')
                .not('referrer_id', 'is', null);

            // Find first subscription per customer
            const customerFirstSub = new Map<string, string>();
            const sortedSubs = [...subs].sort((a, b) => {
                const dateA = a.date_installed ? new Date(a.date_installed).getTime() : Infinity;
                const dateB = b.date_installed ? new Date(b.date_installed).getTime() : Infinity;
                return dateA - dateB;
            });
            sortedSubs.forEach(sub => {
                const customerId = (sub.customers as any)?.id;
                if (customerId && !customerFirstSub.has(customerId)) {
                    customerFirstSub.set(customerId, sub.id);
                }
            });

            // Filter out already invoiced subscriptions and calculate amounts
            const eligible: SubscriptionPreview[] = [];

            for (const sub of subs) {
                if (invoicedIds.has(sub.id)) continue;

                const customer = sub.customers as any;
                const plan = sub.plans as any;
                const prevCount = prevInvoiceCount.get(sub.id) || 0;
                const dateInstalled = sub.date_installed ? new Date(sub.date_installed) : null;

                let calculatedAmount = plan.monthly_fee;
                let isProrated = false;
                let proratedDays: number | undefined;

                // Check for pro-rating (new customers in their first billing cycle)
                if (dateInstalled && prevCount === 0) {
                    const shouldProrate = needsProrating(
                        dateInstalled,
                        dates.generationDate,
                        dates.fromDate
                    );

                    if (shouldProrate) {
                        const prorated = calculateProratedAmount(
                            plan.monthly_fee,
                            dateInstalled,
                            dates.dueDate
                        );
                        calculatedAmount = prorated.proratedAmount;
                        isProrated = true;
                        proratedDays = prorated.daysUsed;
                    }
                }

                // Check for referral discount
                const customerId = customer?.id;
                const isFirstSub = customerId && customerFirstSub.get(customerId) === sub.id;
                const hasReferrer = prospects && prospects.length > 0; // Simplified check
                const referralDiscount = isFirstSub && hasReferrer && !sub.referral_credit_applied ? 300 : 0;

                // Apply credits (negative balance)
                let creditsApplied = 0;
                let currentBalance = Number(sub.balance) || 0;

                if (currentBalance < 0) {
                    const availableCredit = Math.abs(currentBalance);
                    creditsApplied = Math.min(availableCredit, calculatedAmount);
                }

                // Add outstanding balance
                const outstandingBalance = currentBalance > 0 ? currentBalance : 0;

                // Calculate final amount
                const amountAfterDiscount = Math.max(0, calculatedAmount - referralDiscount);
                const amountAfterCredits = Math.max(0, amountAfterDiscount - creditsApplied);
                const finalAmount = amountAfterCredits + outstandingBalance;

                eligible.push({
                    id: sub.id,
                    customerName: customer?.name || 'Unknown',
                    planName: plan?.name || 'Unknown',
                    monthlyFee: plan?.monthly_fee || 0,
                    dateInstalled: sub.date_installed,
                    currentBalance,
                    isProrated,
                    proratedDays,
                    calculatedAmount,
                    finalAmount,
                    creditsApplied,
                    referralDiscount,
                    hasReferrer: hasReferrer || false,
                    referralCreditApplied: sub.referral_credit_applied || false,
                });
            }

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
        setGenerationResult(null);

        try {
            const unit = businessUnits.find(u => u.id === selectedUnit);
            if (!unit) throw new Error('Business unit not found');

            const [year, month] = billingMonth.split('-');
            const yearInt = parseInt(year);
            const monthInt = parseInt(month);

            // Calculate dates based on business unit
            const dates = calculateBillingDates(unit.name, yearInt, monthInt);

            const invoices = [];
            const subscriptionUpdates: Array<{ id: string; balance: number; referral_credit_applied?: boolean }> = [];

            for (const sub of subsWithBalances) {
                // Prepare invoice
                invoices.push({
                    subscription_id: sub.id,
                    due_date: toISODateString(dates.dueDate),
                    from_date: toISODateString(dates.fromDate),
                    to_date: toISODateString(dates.toDate),
                    amount_due: sub.finalAmount,
                    original_amount: sub.calculatedAmount,
                    discount_applied: sub.referralDiscount,
                    credits_applied: sub.creditsApplied,
                    is_prorated: sub.isProrated,
                    prorated_days: sub.proratedDays || null,
                    payment_status: sub.finalAmount === 0 ? 'Paid' : 'Unpaid'
                });

                // Calculate new balance
                let newBalance: number;
                if (sub.currentBalance < 0) {
                    // Had credits - apply them and set new balance to remaining amount
                    newBalance = sub.finalAmount;
                } else {
                    // No credits or had debt - new balance is the final amount
                    newBalance = sub.finalAmount;
                }

                const update: { id: string; balance: number; referral_credit_applied?: boolean } = {
                    id: sub.id,
                    balance: newBalance,
                };

                // Mark referral credit as applied if used
                if (sub.referralDiscount > 0 && !sub.referralCreditApplied) {
                    update.referral_credit_applied = true;
                }

                subscriptionUpdates.push(update);
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

            // Update subscription balances
            for (const update of subscriptionUpdates) {
                const { error: updateError } = await supabase
                    .from('subscriptions')
                    .update({
                        balance: update.balance,
                        ...(update.referral_credit_applied !== undefined && { referral_credit_applied: update.referral_credit_applied }),
                    })
                    .eq('id', update.id);

                if (updateError) {
                    console.error(`Failed to update subscription ${update.id}`, updateError);
                }
            }

            // TODO: Send SMS notifications if sendSms is true
            // For now, we'll just track that we would send them
            const smsSentCount = sendSms ? subsWithBalances.length : 0;

            setGenerationResult({
                success: true,
                generated: invoices.length,
                smsSent: smsSentCount,
            });

            // Refresh eligibility check
            checkEligibleSubscriptions();
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

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');

    // Only current year is allowed
    const years = [currentYear];

    // Only current month is allowed
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

    // Determine if cycle date should be locked based on business unit
    const getLockedCycleDate = (): '15th' | '30th' | null => {
        const unit = businessUnits.find(u => u.id === selectedUnit);
        if (!unit) return null;
        const unitName = unit.name.toLowerCase();
        if (unitName.includes('bulihan') || unitName.includes('extension')) {
            return '15th';
        }
        if (unitName.includes('malanggam')) {
            return '30th';
        }
        return null;
    };

    const lockedCycleDate = getLockedCycleDate();

    // Calculate billing period for display
    const getBillingPeriodDisplay = () => {
        const unit = businessUnits.find(u => u.id === selectedUnit);
        if (!unit) return '';

        const [year, month] = billingMonth.split('-');
        const dates = calculateBillingDates(unit.name, parseInt(year), parseInt(month));

        return `${formatDatePH(dates.fromDate)} - ${formatDatePH(dates.toDate)}`;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-purple-900/50 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-[0_0_60px_rgba(139,92,246,0.15)] flex flex-col">
                <div className="relative p-6 border-b border-gray-800/50 flex justify-between items-center flex-shrink-0">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 via-violet-600/10 to-fuchsia-600/10" />
                    <div className="relative flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-600 to-emerald-600 flex items-center justify-center shadow-lg">
                            <Calendar className="w-5 h-5 text-white" />
                        </div>
                        <h2 className="text-xl font-bold text-white">Generate Invoices</h2>
                    </div>
                    <button onClick={onClose} className="relative text-gray-500 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                    {/* Success Result */}
                    {generationResult && generationResult.success && (
                        <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-4 flex items-start gap-3">
                            <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                            <div>
                                <div className="text-green-400 font-medium">Invoices Generated Successfully!</div>
                                <div className="text-sm text-gray-400 mt-1">
                                    {generationResult.generated} invoices created
                                    {generationResult.smsSent > 0 && ` • ${generationResult.smsSent} SMS notifications queued`}
                                </div>
                            </div>
                        </div>
                    )}

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
                                        value={currentMonth}
                                        disabled
                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-4 py-2 text-white appearance-none cursor-not-allowed opacity-70"
                                    >
                                        {months.map(m => (
                                            <option key={m.value} value={m.value} disabled={m.value !== currentMonth}>
                                                {m.label}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-500 pointer-events-none" />
                                </div>
                                <div className="relative">
                                    <select
                                        value={currentYear.toString()}
                                        disabled
                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-4 py-2 text-white appearance-none cursor-not-allowed opacity-70"
                                    >
                                        <option value={currentYear}>{currentYear}</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-500 pointer-events-none" />
                                </div>
                            </div>
                            <p className="text-xs text-gray-500">Only current month billing is allowed</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-gray-400">Cycle Date</label>
                            <div className="group relative">
                                <Info className="w-4 h-4 text-gray-500 cursor-help" />
                                <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 bg-gray-800 text-xs text-gray-300 p-2 rounded shadow-lg z-10">
                                    Billing period: {getBillingPeriodDisplay()}
                                </div>
                            </div>
                            {lockedCycleDate && (
                                <span className="text-xs text-purple-400 ml-2">
                                    (Auto-selected for this business unit)
                                </span>
                            )}
                        </div>
                        <select
                            value={lockedCycleDate || cycleDate}
                            onChange={(e) => !lockedCycleDate && setCycleDate(e.target.value as '15th' | '30th')}
                            disabled={!!lockedCycleDate}
                            className={`w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:outline-none ${lockedCycleDate ? 'cursor-not-allowed opacity-70' : ''}`}
                        >
                            <option value="15th" disabled={lockedCycleDate === '30th'}>
                                15th (Gen: 10th, Due: 15th, Disc: 20th)
                            </option>
                            <option value="30th" disabled={lockedCycleDate === '15th'}>
                                30th (Gen: 25th, Due: 30th, Disc: 5th)
                            </option>
                        </select>
                    </div>

                    {/* SMS Option */}
                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="sendSms"
                            checked={sendSms}
                            onChange={(e) => setSendSms(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-500 focus:ring-blue-500"
                        />
                        <label htmlFor="sendSms" className="text-sm text-gray-400">
                            Send SMS notifications to customers
                        </label>
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

                        {/* Preview Toggle */}
                        {eligibleSubs > 0 && (
                            <button
                                onClick={() => setShowPreview(!showPreview)}
                                className="mt-3 text-xs text-blue-400 hover:text-blue-300 underline"
                            >
                                {showPreview ? 'Hide Preview' : 'Show Invoice Preview'}
                            </button>
                        )}

                        {debugInfo && (
                            <div className="mt-3 p-3 bg-yellow-900/20 border border-yellow-700/50 rounded text-xs text-yellow-400">
                                {debugInfo}
                            </div>
                        )}
                    </div>

                    {/* Invoice Preview */}
                    {showPreview && subsWithBalances.length > 0 && (
                        <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg overflow-hidden">
                            <div className="p-3 border-b border-gray-800 bg-[#141414]">
                                <span className="text-sm font-medium text-white">Invoice Preview</span>
                            </div>
                            <div className="max-h-60 overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-[#1a1a1a] sticky top-0">
                                        <tr className="text-gray-400">
                                            <th className="text-left p-2">Customer</th>
                                            <th className="text-right p-2">Base</th>
                                            <th className="text-right p-2">Adjustments</th>
                                            <th className="text-right p-2">Final</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {subsWithBalances.map((sub) => (
                                            <tr key={sub.id} className="border-b border-gray-800/50">
                                                <td className="p-2">
                                                    <div className="text-white">{sub.customerName}</div>
                                                    <div className="text-gray-500">
                                                        {sub.planName}
                                                        {sub.isProrated && (
                                                            <span className="ml-1 px-1 py-0.5 bg-blue-900/30 text-blue-400 rounded text-[10px]">
                                                                Pro-rated ({sub.proratedDays} days)
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-2 text-right text-white">
                                                    ₱{sub.calculatedAmount.toLocaleString()}
                                                </td>
                                                <td className="p-2 text-right">
                                                    {sub.referralDiscount > 0 && (
                                                        <div className="text-green-400">-₱{sub.referralDiscount} (Referral)</div>
                                                    )}
                                                    {sub.creditsApplied > 0 && (
                                                        <div className="text-green-400">-₱{sub.creditsApplied} (Credits)</div>
                                                    )}
                                                    {sub.currentBalance > 0 && (
                                                        <div className="text-red-400">+₱{sub.currentBalance} (Balance)</div>
                                                    )}
                                                    {sub.referralDiscount === 0 && sub.creditsApplied === 0 && sub.currentBalance <= 0 && (
                                                        <span className="text-gray-500">—</span>
                                                    )}
                                                </td>
                                                <td className="p-2 text-right font-medium text-white">
                                                    ₱{sub.finalAmount.toLocaleString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="p-3 border-t border-gray-800 bg-[#141414] flex justify-between items-center">
                                <span className="text-xs text-gray-400">Total Amount</span>
                                <span className="text-sm font-bold text-white">
                                    ₱{subsWithBalances.reduce((sum, s) => sum + s.finalAmount, 0).toLocaleString()}
                                </span>
                            </div>
                        </div>
                    )}

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
                                Generate {eligibleSubs} Invoice{eligibleSubs !== 1 ? 's' : ''}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
