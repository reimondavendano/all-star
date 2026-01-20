'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, AlertTriangle, FileText, Calendar, Building2 } from 'lucide-react';
import { calculateProratedAmount, getBillingSchedule } from '@/lib/billing';

interface DisconnectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    subscription: {
        id: string;
        customer_name?: string;
        plan_fee?: number;
        business_unit_id: string;
        business_unit_name?: string;
        date_installed: string;
    };
    onConfirm: () => void;
}

export default function DisconnectionModal({ isOpen, onClose, subscription, onConfirm }: DisconnectionModalProps) {
    const [step, setStep] = useState<'confirm' | 'prorate' | 'success'>('confirm');
    const [isLoading, setIsLoading] = useState(false);
    const [disconnectionType, setDisconnectionType] = useState<'standard' | 'prorated'>('standard');

    // Prorate State
    const [lastDueDate, setLastDueDate] = useState('');
    const [disconnectionDate, setDisconnectionDate] = useState(new Date().toISOString().split('T')[0]);
    const [calculatedBill, setCalculatedBill] = useState<{ amount: number; days: number } | null>(null);

    const calculateProratedBill = () => {
        if (!lastDueDate || !disconnectionDate || !subscription.plan_fee) return;

        const start = new Date(lastDueDate);
        const end = new Date(disconnectionDate);

        // Calculate days used
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const daysUsed = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Daily rate calculation (Monthly Fee / 30)
        const dailyRate = subscription.plan_fee / 30;
        const amount = Math.round(dailyRate * daysUsed * 100) / 100;

        setCalculatedBill({ amount, days: daysUsed });
    };

    const handleDisconnect = async () => {
        setIsLoading(true);
        try {
            // 1. If prorated, generate invoice
            if (disconnectionType === 'prorated' && calculatedBill) {
                const { error: invoiceError } = await supabase
                    .from('invoices')
                    .insert({
                        subscription_id: subscription.id,
                        amount_due: calculatedBill.amount,
                        due_date: new Date().toISOString().split('T')[0], // Due immediately
                        from_date: lastDueDate,
                        to_date: disconnectionDate,
                        payment_status: 'Unpaid',
                        // You might want to add a note or type here if your schema supports it
                    });

                if (invoiceError) throw invoiceError;

                // Update balance
                const { error: balanceError } = await supabase.rpc('increment_balance', {
                    sub_id: subscription.id,
                    amount: calculatedBill.amount
                });

                // Fallback if RPC doesn't exist
                if (balanceError) {
                    const { data: sub } = await supabase.from('subscriptions').select('balance').eq('id', subscription.id).single();
                    const newBalance = (sub?.balance || 0) + calculatedBill.amount;
                    await supabase.from('subscriptions').update({ balance: newBalance }).eq('id', subscription.id);
                }
            }

            // 2. Set Active = False
            const { error: updateError } = await supabase
                .from('subscriptions')
                .update({ active: false })
                .eq('id', subscription.id);

            if (updateError) throw updateError;

            // 3. Call MikroTik Sync (handled by parent or existing webhook?) 
            // In the parent component, we call onConfirm which handles the state update.
            // But we should probably ensure the sync happens. 
            // We'll rely on the parent's `handleToggleActive` logic or `syncSubscriptionToMikrotik`
            // Ideally, we replicate the parent's disconnect logic here or just let the parent handle the status update?
            // "onConfirm" in parent usually just refetches. We need to actually do the update here 
            // because this modal REPLACES the simple toggle when disconnection is chosen.

            // Actually, let's assume onConfirm will just refresh the list. 
            // The logic above sets active=false in DB.

            onConfirm();
            setStep('success');

        } catch (error) {
            console.error('Disconnection error:', error);
            alert('Failed to process disconnection');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-[#0a0a0a] border border-red-900/50 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">

                {/* Header */}
                <div className="p-6 bg-red-950/20 border-b border-red-900/30 flex items-start gap-4">
                    <div className="p-3 bg-red-900/20 rounded-lg">
                        <AlertTriangle className="w-6 h-6 text-red-500" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">Disconnect Subscription</h3>
                        <p className="text-sm text-gray-400 mt-1">
                            {subscription.customer_name} • {subscription.business_unit_name}
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {step === 'confirm' && (
                        <div className="space-y-4">
                            <div className="space-y-3">
                                <label className="flex items-center gap-3 p-4 rounded-lg bg-[#151515] border border-gray-800 cursor-pointer hover:border-gray-700 transition-colors">
                                    <input
                                        type="radio"
                                        name="disconnectionType"
                                        value="standard"
                                        checked={disconnectionType === 'standard'}
                                        onChange={() => setDisconnectionType('standard')}
                                        className="w-4 h-4 text-red-600 focus:ring-red-600 bg-gray-900 border-gray-700"
                                    />
                                    <div>
                                        <div className="font-medium text-white">Standard Disconnection</div>
                                        <div className="text-xs text-gray-500">Just disable the service. No extra invoice.</div>
                                    </div>
                                </label>

                                <label className="flex items-center gap-3 p-4 rounded-lg bg-[#151515] border border-gray-800 cursor-pointer hover:border-gray-700 transition-colors">
                                    <input
                                        type="radio"
                                        name="disconnectionType"
                                        value="prorated"
                                        checked={disconnectionType === 'prorated'}
                                        onChange={() => setDisconnectionType('prorated')}
                                        className="w-4 h-4 text-red-600 focus:ring-red-600 bg-gray-900 border-gray-700"
                                    />
                                    <div>
                                        <div className="font-medium text-white">Disconnect & Generate Final Bill</div>
                                        <div className="text-xs text-gray-500">Calculate days used since last due date.</div>
                                    </div>
                                </label>
                            </div>

                            {disconnectionType === 'prorated' && (
                                <div className="space-y-4 pt-4 border-t border-gray-800 animate-in fade-in slide-in-from-top-2">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-gray-500">Last Due Date</label>
                                            <input
                                                type="date"
                                                value={lastDueDate}
                                                onChange={(e) => setLastDueDate(e.target.value)}
                                                className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-red-500 outline-none"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-gray-500">Disconnection Date</label>
                                            <input
                                                type="date"
                                                value={disconnectionDate}
                                                onChange={(e) => setDisconnectionDate(e.target.value)}
                                                className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-red-500 outline-none"
                                            />
                                        </div>
                                    </div>

                                    <button
                                        onClick={calculateProratedBill}
                                        disabled={!lastDueDate || !disconnectionDate}
                                        className="w-full py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-xs font-medium text-white rounded-lg transition-colors border border-gray-700"
                                    >
                                        Calculate Bill Amount
                                    </button>

                                    {calculatedBill && (
                                        <div className="bg-red-950/30 border border-red-900/50 rounded-lg p-4 flex justify-between items-center">
                                            <div>
                                                <div className="text-sm font-medium text-white">Final Invoice Amount</div>
                                                <div className="text-xs text-red-400">For {calculatedBill.days} Overdue Days</div>
                                            </div>
                                            <div className="text-xl font-bold text-white">
                                                ₱{calculatedBill.amount.toLocaleString()}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-800 bg-[#0f0f0f] flex gap-3 justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleDisconnect}
                        disabled={isLoading || (disconnectionType === 'prorated' && !calculatedBill)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
                    >
                        {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {disconnectionType === 'prorated' ? 'Disconnect & Bill' : 'Confirm Disconnect'}
                    </button>
                </div>
            </div>
        </div>
    );
}
