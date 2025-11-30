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
                await axios.post('/api/paymongo/create-payment', {
                    source_id: sourceId,
                    amount: parseFloat(amount),
                    description: `Subscription Payment - ${subscriptionId}`
                });

                // 2. Record Payment in Supabase
                if (subscriptionId) {
                    const { error: paymentError } = await supabase
                        .from('payments')
                        .insert({
                            subscription_id: subscriptionId,
                            amount: parseFloat(amount),
                            mode: 'GCash/PayMaya',
                            notes: `Online Payment via PayMongo (Source: ${sourceId})`,
                            settlement_date: new Date().toISOString().split('T')[0]
                        });

                    if (paymentError) console.error('Error recording payment:', paymentError);

                    // 3. Update Subscription Balance
                    // Fetch current balance first
                    const { data: sub } = await supabase
                        .from('subscriptions')
                        .select('balance')
                        .eq('id', subscriptionId)
                        .single();

                    if (sub) {
                        const newBalance = (sub.balance || 0) - parseFloat(amount);
                        await supabase
                            .from('subscriptions')
                            .update({ balance: newBalance })
                            .eq('id', subscriptionId);
                    }
                }

                setStatus('success');
                setMessage('Payment successful! Your balance has been updated.');

                // Clear session
                sessionStorage.removeItem('pending_payment_source_id');
                sessionStorage.removeItem('pending_payment_amount');
                sessionStorage.removeItem('pending_payment_sub_id');

            } catch (error: any) {
                console.error('Payment Finalization Error:', error);
                setStatus('failed');
                setMessage(error.response?.data?.error || 'Failed to process payment. Please contact support.');
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
