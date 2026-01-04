'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
    CheckCircle,
    XCircle,
    Loader2,
    Search,
    Upload,
    CreditCard,
    Building,
    FileText,
    AlertCircle,
    Banknote,
    Eye,
    DollarSign
} from 'lucide-react';
import { approvePayment, rejectPayment } from '@/app/actions/subscription';
import { getPaymentAccounts } from '@/app/actions/verification';
import Link from 'next/link';
import VerifyPaymentModal from '@/components/admin/VerifyPaymentModal';
import Image from 'next/image';
import UploadPaymentModal from '@/components/admin/UploadPaymentModal';

interface VerificationItem {
    id: string;
    amount: number;
    mode: string;
    notes: string;
    settlement_date: string;
    created_at: string;
    subscription: {
        address: string; // Used for "Business Unit" roughly
        plan: {
            name: string;
        };
        customer: {
            name: string;
            mobile_number: string;
        };
    };
    invoice?: {
        due_date: string;
        from_date: string;
        to_date: string;
    };
}

export default function VerificationPage() {
    const [activeTab, setActiveTab] = useState<'verification' | 'settings'>('verification');
    const [payments, setPayments] = useState<VerificationItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);

    // Modal State
    const [selectedPayment, setSelectedPayment] = useState<any>(null);
    const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [configuredMethods, setConfiguredMethods] = useState<Record<string, any>>({});

    useEffect(() => {
        if (activeTab === 'verification') {
            fetchPendingPayments();
        } else if (activeTab === 'settings') {
            getPaymentAccounts().then(res => {
                if (res.success && res.accounts) {
                    setConfiguredMethods(res.accounts);
                } else {
                    setConfiguredMethods({});
                }
            });
        }
    }, [activeTab, showUploadModal]);

    const fetchPendingPayments = async () => {
        setIsLoading(true);
        try {
            // Fetch payments with 'Pending Verification' in notes
            const { data, error } = await supabase
                .from('payments')
                .select(`
                    id,
                    amount,
                    mode,
                    notes,
                    settlement_date,
                    created_at,
                    subscription:subscriptions (
                        address,
                        plan:plans (name),
                        customer:customers!subscriptions_subscriber_id_fkey (name, mobile_number)
                    ),
                    invoice:invoices (
                        due_date,
                        from_date,
                        to_date
                    )
                `)
                .ilike('notes', '%Pending Verification%')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const formattedData = (data || []).map((p: any) => {
                const sub = Array.isArray(p.subscription) ? p.subscription[0] : p.subscription;
                if (sub) {
                    sub.plan = Array.isArray(sub.plan) ? sub.plan[0] : sub.plan;
                    sub.customer = Array.isArray(sub.customer) ? sub.customer[0] : sub.customer;
                }
                return {
                    ...p,
                    subscription: sub,
                    invoice: Array.isArray(p.invoice) ? p.invoice[0] : p.invoice
                };
            });

            setPayments(formattedData);
        } catch (error) {
            console.error('Error fetching payments:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleApproveClick = (payment: any) => {
        setSelectedPayment(payment);
        setIsVerifyModalOpen(true);
    };

    const handleVerifyConfirm = async (approvedAmount: number) => {
        if (!selectedPayment) return;

        const id = selectedPayment.id;
        const originalAmount = selectedPayment.amount;
        const isPartial = approvedAmount < originalAmount;

        setProcessingId(id);
        try {
            const result = await approvePayment(
                id,
                approvedAmount,
                isPartial ? 'Partial payment approved' : undefined
            );

            if (result.success) {
                // Success: Close modal and refresh
                setIsVerifyModalOpen(false);
                setSelectedPayment(null);
                fetchPendingPayments();
            } else {
                alert('Verification failed: ' + result.error);
            }
        } catch (error) {
            console.error('Approve error:', error);
            alert('An unexpected error occurred');
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (id: string) => {
        const reason = prompt('Enter rejection reason (optional):');
        if (!confirm('Are you sure you want to REJECT this payment? This cannot be undone.')) return;

        setProcessingId(id);
        try {
            const result = await rejectPayment(id, reason || undefined);
            if (result.success) {
                setPayments(prev => prev.filter(p => p.id !== id));
                alert('Payment rejected.');
            } else {
                alert('Failed to reject: ' + result.error);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setProcessingId(null);
        }
    };

    const extractRefId = (notes: string) => {
        const match = notes.match(/Ref:\s*([^\s.,-]+)/);
        return match ? match[1] : 'N/A';
    };

    const extractProofUrl = (notes: string): string | null => {
        const match = notes.match(/Proof:\s*([^\s]+)/);
        return match ? match[1] : null;
    };

    return (
        <div className="p-6 space-y-6 min-h-screen bg-[#0f0f0f] text-gray-100">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <CheckCircle className="w-8 h-8 text-emerald-500" />
                        E-Payment Verification
                    </h1>
                    <p className="text-gray-400 mt-1">Verify manual payments and manage QR codes.</p>
                </div>

                <div className="flex bg-[#1a1a1a] p-1 rounded-lg border border-gray-800">
                    <button
                        onClick={() => setActiveTab('verification')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'verification'
                            ? 'bg-emerald-600 text-white shadow-lg'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        Pending Validations
                    </button>
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'settings'
                            ? 'bg-violet-600 text-white shadow-lg'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        Payment Settings
                    </button>
                </div>
            </div>

            {activeTab === 'verification' ? (
                <div className="glass-card overflow-hidden border border-gray-800 rounded-xl bg-[#0a0a0a]">
                    <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                        <h2 className="text-lg font-semibold text-white">Pending Requests</h2>
                        <span className="bg-emerald-900/30 text-emerald-400 px-3 py-1 rounded-full text-xs border border-emerald-900/50">
                            {payments.length} Pending
                        </span>
                    </div>

                    {isLoading ? (
                        <div className="p-12 flex justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                        </div>
                    ) : payments.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">
                            <CheckCircle className="w-12 h-12 mx-auto mb-4 text-gray-700" />
                            <p>No pending verifications found.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-900/50 text-gray-400 text-xs uppercase border-b border-gray-800">
                                        <th className="p-4 font-medium">Customer</th>
                                        <th className="p-4 font-medium">Payment Details</th>
                                        <th className="p-4 font-medium">Reference</th>
                                        <th className="p-4 font-medium">Date/Period</th>
                                        <th className="p-4 font-medium text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {payments.map((payment) => (
                                        <tr key={payment.id} className="hover:bg-white/5 transition-colors">
                                            <td className="p-4">
                                                <p className="font-bold text-white">{payment.subscription?.customer?.name || 'Unknown'}</p>
                                                <p className="text-xs text-gray-500">{payment.subscription?.customer?.mobile_number}</p>
                                                <div className="text-xs mt-1 text-violet-400 bg-violet-900/10 px-2 py-0.5 rounded w-fit">
                                                    {(Array.isArray(payment.subscription?.plan) ? payment.subscription.plan[0]?.name : payment.subscription?.plan?.name) || 'No Plan'}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <p className="font-mono text-emerald-400 font-bold">₱{payment.amount.toLocaleString()}</p>
                                                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                                    <CreditCard className="w-3 h-3" />
                                                    {payment.mode}
                                                </p>
                                                <p className="text-xs text-gray-500">{payment.subscription?.address}</p>
                                            </td>
                                            <td className="p-4">
                                                <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1 font-mono text-sm text-yellow-500 w-fit select-all">
                                                    {extractRefId(payment.notes)}
                                                </div>
                                                {/* Proof Image */}
                                                {extractProofUrl(payment.notes) && (
                                                    <a
                                                        href={extractProofUrl(payment.notes) || '#'}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="mt-2 inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 underline"
                                                    >
                                                        <Eye className="w-3 h-3" />
                                                        View Proof
                                                    </a>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <p className="text-sm text-white">Due: {payment.invoice ? new Date(payment.invoice.due_date).toLocaleDateString() : 'N/A'}</p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Period: {payment.invoice ? `${new Date(payment.invoice.from_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${new Date(payment.invoice.to_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'N/A'}
                                                </p>
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex gap-2 w-full">
                                                    <button
                                                        onClick={() => handleApproveClick(payment)}
                                                        disabled={processingId === payment.id}
                                                        className="flex-1 py-1.5 px-3 bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-400 text-xs rounded border border-emerald-800 transition-colors flex items-center justify-center gap-1 font-medium"
                                                    >
                                                        <CheckCircle className="w-3 h-3" />
                                                        {processingId === payment.id ? '...' : 'Approve'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleReject(payment.id)}
                                                        disabled={processingId === payment.id}
                                                        className="flex-1 py-1.5 px-3 bg-red-900/40 hover:bg-red-800/60 text-red-400 text-xs rounded border border-red-800 transition-colors flex items-center justify-center gap-1 font-medium"
                                                    >
                                                        <XCircle className="w-3 h-3" />
                                                        Reject
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Settings / Upload Actions */}
                    <div className="glass-card p-8 border border-gray-800 rounded-xl bg-[#0a0a0a] text-center">
                        <div className="w-16 h-16 bg-violet-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Upload className="w-8 h-8 text-violet-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Manage Payment Methods</h2>
                        <p className="text-gray-400 mb-8 max-w-lg mx-auto">
                            Add or update QR codes and account details for GCash, Maya, and Bank Transfers.
                            These will be immediately visible to customers in their portal.
                        </p>

                        <button
                            onClick={() => setShowUploadModal(true)}
                            className="px-8 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-violet-900/20 hover:scale-105 active:scale-95 flex items-center gap-2 mx-auto"
                        >
                            <Upload className="w-5 h-5" />
                            Add / Update Payment Method
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(configuredMethods).length === 0 ? (
                            <div className="col-span-full text-center py-10 text-gray-500 border border-dashed border-gray-800 rounded-xl">
                                <p>No custom payment methods found.</p>
                                <p className="text-xs mt-1">Uploaded methods will appear here.</p>
                            </div>
                        ) : (
                            Object.entries(configuredMethods).map(([key, details]: [string, any]) => (
                                <div key={key} className="p-5 bg-gray-900/40 border border-gray-800 rounded-xl hover:border-violet-500/30 transition-colors">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="font-bold text-white capitalize flex items-center gap-2">
                                            {key.includes('dash') || key.includes('-') ? (
                                                <>
                                                    <span className={key.split('-')[0] === 'general' ? 'text-gray-400' : 'text-violet-400'}>
                                                        {key.split('-')[0]}
                                                    </span>
                                                    <span className="text-gray-600">/</span>
                                                    <span className="text-white">{key.split('-')[1]}</span>
                                                </>
                                            ) : key}
                                        </h3>
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                                    </div>
                                    <div className="space-y-3">
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Account Name</p>
                                            <p className="text-sm font-medium text-gray-200">{details.accountName || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Account No.</p>
                                            <p className="text-sm font-mono text-emerald-400 tracking-wide">{details.accountNumber || 'N/A'}</p>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-gray-600 mt-4 text-right">
                                        Updated: {details.updatedAt ? new Date(details.updatedAt).toLocaleDateString() : 'N/A'}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )
            }

            <UploadPaymentModal
                isOpen={showUploadModal}
                onClose={() => setShowUploadModal(false)}
            />
            {/* Verification Modal */}
            <VerifyPaymentModal
                isOpen={isVerifyModalOpen}
                payment={selectedPayment}
                onClose={() => setIsVerifyModalOpen(false)}
                onApprove={handleVerifyConfirm}
                isProcessing={Boolean(processingId)}
            />
        </div >
    );
}
