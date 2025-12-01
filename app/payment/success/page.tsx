'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { CheckCircle, XCircle, Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function PaymentSuccessPage() {
    const [status, setStatus] = useState<'processing' | 'success' | 'failed'>('processing');
    const [message, setMessage] = useState('Finalizing your payment...');
    const router = useRouter();

    useEffect(() => {
        const finalizePayment = async () => {
            const sourceId = sessionStorage.getItem('pending_payment_source_id');
            const amount = sessionStorage.getItem('pending_payment_amount');
            const subscriptionId = sessionStorage.getItem('pending_payment_sub_id');
            const customerId = sessionStorage.getItem('pending_payment_customer_id');

            if (!sourceId || !amount) {
                setStatus('failed');
                setMessage('No pending payment found.');
                return;
            }

            try {
                // 1. Create Payment (Charge the source)
                const paymentResponse = await axios.post('/api/paymongo/create-payment', {
                    source_id: sourceId,
                    amount: parseFloat(amount),
                    description: `Subscription Payment - ${subscriptionId}`
                });

                const paymentData = paymentResponse.data;

                // 2. Record Payment in Supabase
                if (subscriptionId) {
                    const paymentAmount = parseFloat(amount);

                    // Insert payment record
                    const { error: paymentError } = await supabase
                        .from('payments')
                        .insert({
                            subscription_id: subscriptionId,
                            amount: paymentAmount,
                            mode: 'E-Wallet',
                            notes: `Online Payment via PayMongo (Ref: ${paymentData.data?.id || sourceId})`,
                            settlement_date: new Date().toISOString().split('T')[0]
                        });

                    if (paymentError) {
                        console.error('Error recording payment:', paymentError);
                        throw new Error('Failed to record payment in database');
                    }

                    // 3. Get all unpaid invoices for this subscription
                    const { data: unpaidInvoices, error: invoiceError } = await supabase
                        .from('invoices')
                        .select('*')
                        .eq('subscription_id', subscriptionId)
                        .in('payment_status', ['Unpaid', 'Partially Paid'])
                        .order('due_date', { ascending: true });

                    if (invoiceError) {
                        console.error('Error fetching invoices:', invoiceError);
                    }

                    // 4. Mark invoices as Paid
                    if (unpaidInvoices && unpaidInvoices.length > 0) {
                        let remainingAmount = paymentAmount;

                        for (const invoice of unpaidInvoices) {
                            if (remainingAmount <= 0) break;

                            const invoiceAmount = Number(invoice.amount_due);

                            if (remainingAmount >= invoiceAmount) {
                                // Full payment - mark as Paid
                                await supabase
                                    .from('invoices')
                                    .update({ payment_status: 'Paid' })
                                    .eq('id', invoice.id);

                                remainingAmount -= invoiceAmount;
                            } else {
                                // Partial payment
                                await supabase
                                    .from('invoices')
                                    .update({ payment_status: 'Partially Paid' })
                                    .eq('id', invoice.id);

                                remainingAmount = 0;
                            }
                        }
                    }
                }

                setStatus('success');
                setMessage('Payment successful! Your invoices have been updated.');

                // Clear session
                sessionStorage.removeItem('pending_payment_source_id');
                sessionStorage.removeItem('pending_payment_amount');
                sessionStorage.removeItem('pending_payment_sub_id');

            } catch (error: any) {
                console.error('Payment Finalization Error:', error);
                setStatus('failed');
                setMessage(error.response?.data?.error || error.message || 'Failed to process payment. Please contact support.');
            }
        };

        finalizePayment();
    }, []);

    const handleReturn = () => {
        const customerId = sessionStorage.getItem('pending_payment_customer_id');
        if (customerId) {
            router.push(`/portal/${customerId}`);
        } else {
            router.push('/');
        }
    };

    return (
        <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
            <div className="bg-[#0a0a0a] border border-gray-800 rounded-xl p-8 max-w-md w-full text-center">
                {status === 'processing' && (
                    <>
                        <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-6" />
                        <h1 className="text-2xl font-bold text-white mb-2">Processing Payment</h1>
                        <p className="text-gray-400">{message}</p>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <div className="w-16 h-16 bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-500/30">
                            <CheckCircle className="w-8 h-8 text-green-500" />
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">Payment Successful!</h1>
                        <p className="text-gray-400 mb-8">{message}</p>
                        <button
                            onClick={handleReturn}
                            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            <ArrowLeft className="w-5 h-5" />
                            Return to Dashboard
                        </button>
                    </>
                )}

                {status === 'failed' && (
                    <>
                        <div className="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/30">
                            <XCircle className="w-8 h-8 text-red-500" />
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">Payment Failed</h1>
                        <p className="text-gray-400 mb-8">{message}</p>
                        <button
                            onClick={handleReturn}
                            className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                        >
                            Return to Dashboard
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
