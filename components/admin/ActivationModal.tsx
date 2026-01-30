'use client';

import { useState } from 'react';
import { Loader2, CheckCircle, FileText, Calendar, AlertTriangle } from 'lucide-react';
import { processActivation } from '@/app/actions/activation';

interface ActivationModalProps {
    isOpen: boolean;
    onClose: () => void;
    subscription: {
        id: string;
        customer_name?: string;
        business_unit_name?: string;
    };
    onConfirm: () => void;
}

export default function ActivationModal({ isOpen, onClose, subscription, onConfirm }: ActivationModalProps) {
    const [step, setStep] = useState<'confirm' | 'success'>('confirm');
    const [isLoading, setIsLoading] = useState(false);
    const [generateInvoice, setGenerateInvoice] = useState(true);
    const [activationDate, setActivationDate] = useState(new Date().toISOString().split('T')[0]);
    const [error, setError] = useState<string | null>(null);

    const handleActivate = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const date = new Date(activationDate);

            const result = await processActivation(
                subscription.id,
                date,
                generateInvoice
            );

            if (!result.success) {
                throw new Error(result.error || 'Failed to process activation');
            }

            onConfirm();
            setStep('success');

        } catch (error) {
            console.error('Activation error:', error);
            setError(error instanceof Error ? error.message : 'Unknown error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-[#0a0a0a] border border-green-900/50 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">

                {/* Header */}
                <div className="p-6 bg-green-950/20 border-b border-green-900/30 flex items-start gap-4">
                    <div className="p-3 bg-green-900/20 rounded-lg">
                        <CheckCircle className="w-6 h-6 text-green-500" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">Activate Subscription</h3>
                        <p className="text-sm text-gray-400 mt-1">
                            {subscription.customer_name} • {subscription.business_unit_name}
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {step === 'confirm' && (
                        <div className="space-y-4">
                            {error && (
                                <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-lg flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-red-400">
                                        <div className="font-semibold">Error</div>
                                        {error}
                                    </div>
                                </div>
                            )}

                            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                                <p className="text-sm text-gray-300 mb-4">
                                    You are about to activate this subscription. This will enable the service immediately.
                                </p>

                                <div className="space-y-3">
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-gray-500">Activation Date</label>
                                        <input
                                            type="date"
                                            value={activationDate}
                                            onChange={(e) => setActivationDate(e.target.value)}
                                            max={new Date().toISOString().split('T')[0]}
                                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-green-500 outline-none"
                                        />
                                        <p className="text-xs text-gray-500">
                                            The date when the service will be activated
                                        </p>
                                    </div>

                                    <label className="flex items-start gap-3 p-4 rounded-lg bg-[#151515] border border-gray-800 cursor-pointer hover:border-gray-700 transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={generateInvoice}
                                            onChange={(e) => setGenerateInvoice(e.target.checked)}
                                            className="mt-0.5 w-4 h-4 text-green-600 focus:ring-green-600 bg-gray-900 border-gray-700 rounded"
                                        />
                                        <div className="flex-1">
                                            <div className="font-medium text-white">Generate Activation Invoice</div>
                                            <div className="text-xs text-gray-500 mt-1">
                                                Automatically create an invoice for the period from the activation date to the next billing date.
                                            </div>
                                        </div>
                                    </label>
                                </div>

                                {generateInvoice && (
                                    <div className="mt-4 p-3 bg-blue-950/30 border border-blue-900/50 rounded-lg">
                                        <div className="flex items-start gap-2">
                                            <FileText className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                                            <div className="text-xs text-blue-300">
                                                <strong>Invoice will be generated automatically</strong>
                                                <p className="mt-1 text-blue-400/80">
                                                    The system will calculate the prorated amount from {new Date(activationDate).toLocaleDateString()} to your next billing date based on {subscription.business_unit_name}.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle className="w-8 h-8 text-green-500" />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">Activation Complete</h3>
                            <p className="text-sm text-gray-400">
                                The subscription has been activated successfully.
                                {generateInvoice && ' An activation invoice has been generated.'}
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-800 bg-[#0f0f0f] flex gap-3 justify-end">
                    {step === 'confirm' ? (
                        <>
                            <button
                                onClick={onClose}
                                className="px-4 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleActivate}
                                disabled={isLoading}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                                Confirm Activation
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                        >
                            Close
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
