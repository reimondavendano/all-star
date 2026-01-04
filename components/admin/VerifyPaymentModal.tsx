import { useState, useEffect } from 'react';
import { X, CheckCircle, AlertTriangle, DollarSign, User, FileText } from 'lucide-react';

interface VerifyPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApprove: (amount: number) => Promise<void>;
    payment: any;
    isProcessing: boolean;
}

export default function VerifyPaymentModal({ isOpen, onClose, onApprove, payment, isProcessing }: VerifyPaymentModalProps) {
    const [amount, setAmount] = useState<string>('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (payment) {
            setAmount(String(payment.amount));
        }
    }, [payment]);

    if (!isOpen || !payment) return null;

    const originalAmount = payment.amount;
    const currentAmount = parseFloat(amount);
    const isPartial = !isNaN(currentAmount) && currentAmount < originalAmount;

    const handleConfirm = () => {
        const value = parseFloat(amount);
        if (isNaN(value) || value <= 0) {
            setError('Please enter a valid amount');
            return;
        }
        if (value > originalAmount) {
            setError('Approved amount cannot exceed original request');
            return;
        }
        onApprove(value);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-[#0f0f0f] border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="p-6 border-b border-gray-800 flex justify-between items-start bg-gray-900/50">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-emerald-500" />
                            Verify Payment
                        </h2>
                        <p className="text-sm text-gray-400 mt-1">Review and approve this transaction</p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Customer Details */}
                    <div className="flex items-center gap-3 p-3 bg-gray-900/50 rounded-lg border border-gray-800">
                        <div className="w-10 h-10 rounded-full bg-violet-900/30 flex items-center justify-center text-violet-400">
                            <User className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="font-medium text-white">{payment.subscription?.customer?.name || 'Unknown Customer'}</div>
                            <div className="text-xs text-gray-400">{payment.subscription?.customer?.mobile_number} • {payment.subscription?.plan?.name}</div>
                        </div>
                    </div>

                    {/* Payment Info */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 uppercase mb-2">Verified Amount</label>
                            <div className="relative group">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-emerald-500 transition-colors" />
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={(e) => {
                                        setAmount(e.target.value);
                                        setError('');
                                    }}
                                    className="w-full bg-black border border-gray-800 rounded-xl py-3 pl-10 pr-4 text-white text-lg font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                                    placeholder="0.00"
                                />
                            </div>
                            {error && <p className="text-red-400 text-xs mt-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {error}</p>}

                            {/* Comparison */}
                            <div className="flex justify-between items-center mt-2 px-1">
                                <span className="text-xs text-gray-500">Original Request:</span>
                                <span className="text-sm font-medium text-gray-300">₱{originalAmount.toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Partial Payment Warning */}
                        {isPartial && (
                            <div className="p-3 bg-amber-900/20 border border-amber-900/50 rounded-lg flex gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                                <div className="text-xs text-amber-200">
                                    <span className="font-bold block mb-0.5">Partial Approval</span>
                                    This amount is less than the requested ₱{originalAmount.toLocaleString()}. The remaining balance will still be due.
                                </div>
                            </div>
                        )}

                        {/* Notes Preview */}
                        <div className="p-3 bg-gray-900/30 rounded-lg border border-gray-800/50">
                            <div className="flex items-center gap-2 mb-1">
                                <FileText className="w-3 h-3 text-gray-500" />
                                <span className="text-xs text-gray-500 font-medium">Payment Notes</span>
                            </div>
                            <p className="text-xs text-gray-400 break-words line-clamp-2">
                                {payment.notes || 'No notes provided'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-gray-800 bg-gray-900/30 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl transition-colors"
                        disabled={isProcessing}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isProcessing}
                        className="flex-1 py-3 px-4 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isProcessing ? (
                            <>Processing...</>
                        ) : (
                            <>
                                <CheckCircle className="w-4 h-4" />
                                Confirm Verification
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
