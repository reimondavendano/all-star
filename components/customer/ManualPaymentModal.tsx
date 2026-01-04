'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, CheckCircle, Loader2, Upload, ChevronRight, ChevronLeft, Camera, AlertCircle, ImageIcon } from 'lucide-react';
import Image from 'next/image';
import Tesseract from 'tesseract.js';
import { getPaymentAccounts } from '@/app/actions/verification';

interface ManualPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    amount: number;
    businessUnit: string;
    onSubmit: (result: { wallet: string; referenceNumber: string; proofImage?: File }) => Promise<void>;
    isSubmitting: boolean;
}

export default function ManualPaymentModal({
    isOpen,
    onClose,
    amount,
    businessUnit,
    onSubmit,
    isSubmitting
}: ManualPaymentModalProps) {
    // Step management: 1 = QR, 2 = Reference/Upload, 3 = Review
    const [step, setStep] = useState(1);

    const [wallet, setWallet] = useState<'GCash' | 'Maya' | 'Bank'>('GCash');
    const [selectedBank, setSelectedBank] = useState('BPI');
    const [referenceNumber, setReferenceNumber] = useState('');
    const [imgSrc, setImgSrc] = useState('');
    const [accountDetails, setAccountDetails] = useState<{ name?: string, number?: string } | null>(null);

    // Proof/Receipt upload states
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [proofPreview, setProofPreview] = useState<string | null>(null);
    const [isOcrProcessing, setIsOcrProcessing] = useState(false);
    const [ocrStatus, setOcrStatus] = useState<string>('');
    const [ocrDetected, setOcrDetected] = useState(false);

    const bankOptions = [
        'BPI', 'BDO', 'Metrobank', 'RCBC', 'UnionBank', 'LandBank', 'Security Bank', 'PNB'
    ];

    const getBusinessUnitCode = (address: string) => {
        const lower = address.toLowerCase();
        if (lower.includes('malanggam')) return 'malanggam';
        if (lower.includes('bulihan')) return 'bulihan';
        if (lower.includes('extension')) return 'extension';
        return 'general';
    };

    const unitCode = getBusinessUnitCode(businessUnit);
    const paymentIdentifier = wallet === 'Bank' ? selectedBank.toLowerCase() : wallet.toLowerCase();
    const displayIdentifier = wallet === 'Bank' ? selectedBank : wallet;

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const res = await getPaymentAccounts();
                if (res.success && res.accounts) {
                    const data = res.accounts;
                    const specificKey = `${unitCode}-${paymentIdentifier}`;
                    const generalKey = `general-${paymentIdentifier}`;
                    const details = data[specificKey] || data[generalKey];

                    if (details) {
                        setAccountDetails({
                            name: details.accountName,
                            number: details.accountNumber
                        });

                        if (details.imageUrl) {
                            setImgSrc(details.imageUrl);
                        } else {
                            // Fallback if no image URL but details exist
                            setImgSrc(`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=PAY-${unitCode.toUpperCase()}-${paymentIdentifier.toUpperCase()}-${amount}`);
                        }
                    } else {
                        setAccountDetails(null);
                        setImgSrc(`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=PAY-${unitCode.toUpperCase()}-${paymentIdentifier.toUpperCase()}-${amount}`);
                    }
                }
            } catch (e) {
                setAccountDetails(null);
                setImgSrc(`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=PAY-${unitCode.toUpperCase()}-${paymentIdentifier.toUpperCase()}-${amount}`);
            }
        };
        fetchDetails();
    }, [unitCode, paymentIdentifier, amount]);

    // Reset on close
    useEffect(() => {
        if (!isOpen) {
            setStep(1);
            setReferenceNumber('');
            setProofFile(null);
            setProofPreview(null);
            setOcrDetected(false);
            setOcrStatus('');
            setSubmitStatus('idle');
        }
    }, [isOpen]);

    // OCR Processing Function
    const processReceiptOCR = useCallback(async (file: File) => {
        setIsOcrProcessing(true);
        setOcrStatus('Reading receipt...');
        setOcrDetected(false);

        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const imageData = e.target?.result as string;
                setProofPreview(imageData);

                setOcrStatus('Analyzing text...');

                const result = await Tesseract.recognize(imageData, 'eng', {
                    logger: (m) => {
                        if (m.status === 'recognizing text') {
                            setOcrStatus(`Scanning... ${Math.round(m.progress * 100)}%`);
                        }
                    }
                });

                const text = result.data.text;
                console.log('OCR Text:', text);

                // Pattern matching for reference numbers
                // GCash patterns: "Ref. No.", "Reference No", numbers like "1234 5678 9012"
                // Maya patterns: "Transaction ID", "Reference"
                const patterns = [
                    /Ref\.?\s*No\.?\s*[:.]?\s*(\d[\d\s]{6,})/i,
                    /Reference\s*(?:No\.?|Number|ID)?\s*[:.]?\s*(\d[\d\s]{6,})/i,
                    /Transaction\s*(?:No\.?|ID)?\s*[:.]?\s*(\d[\d\s]{6,})/i,
                    /(?:^|\s)(\d{4}\s?\d{4}\s?\d{4})(?:\s|$)/m,  // 12 digit format
                    /(?:^|\s)(\d{10,14})(?:\s|$)/m,  // 10-14 continuous digits
                ];

                let foundRef = '';
                for (const pattern of patterns) {
                    const match = text.match(pattern);
                    if (match && match[1]) {
                        foundRef = match[1].replace(/\s+/g, '').trim();
                        break;
                    }
                }

                if (foundRef && foundRef.length >= 8) {
                    setReferenceNumber(foundRef);
                    setOcrDetected(true);
                    setOcrStatus('Reference number detected!');
                } else {
                    setOcrStatus('Could not detect reference. Please enter manually.');
                }
                setIsOcrProcessing(false);
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error('OCR Error:', error);
            setOcrStatus('Failed to read receipt. Please enter manually.');
            setIsOcrProcessing(false);
        }
    }, []);

    const handleProofUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setProofFile(file);
            processReceiptOCR(file);
        }
    };

    const [submitStatus, setSubmitStatus] = useState<'idle' | 'success'>('idle');

    const handleSubmit = async () => {
        if (!referenceNumber) return;
        const finalWallet = wallet === 'Bank' ? `Bank-${selectedBank}` : wallet;
        try {
            await onSubmit({ wallet: finalWallet, referenceNumber, proofImage: proofFile || undefined });
            setSubmitStatus('success');
        } catch (error) {
            console.error(error);
        }
    };

    if (!isOpen) return null;

    if (submitStatus === 'success') {
        return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
                <div className="relative bg-[#0a0a0a] border border-emerald-900/50 rounded-2xl p-8 max-w-sm w-full shadow-[0_0_60px_rgba(16,185,129,0.15)] animate-in fade-in zoom-in duration-300 text-center">
                    <div className="w-20 h-20 bg-emerald-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle className="w-10 h-10 text-emerald-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Payment Submitted!</h2>
                    <p className="text-gray-400 mb-8 text-sm leading-relaxed">
                        Your payment of <span className="text-emerald-400 font-bold">₱{amount.toLocaleString()}</span> has been received and is pending admin verification.
                    </p>
                    <button
                        onClick={onClose}
                        className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-900/20 hover:shadow-emerald-900/40 hover:-translate-y-0.5"
                    >
                        Return to Portal
                    </button>
                </div>
            </div>
        );
    }

    const stepTitles = ['Scan QR Code', 'Upload Proof', 'Confirm Payment'];

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-[#0a0a0a] border-2 border-violet-900/50 rounded-2xl w-full max-w-md max-h-[90vh] mt-8 flex flex-col shadow-[0_0_50px_rgba(139,92,246,0.15)] animate-in fade-in zoom-in duration-300 overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b border-gray-800/50 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-white">Pay ₱{amount.toLocaleString()}</h2>
                        <p className="text-xs text-gray-500">{unitCode.toUpperCase()} Branch</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors p-1"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Step Indicator */}
                <div className="flex items-center justify-between px-6 py-3 bg-gray-900/30 border-b border-gray-800/50">
                    {[1, 2, 3].map((s) => (
                        <div key={s} className={`flex items-center ${s < 3 ? 'flex-1' : ''}`}>
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step >= s
                                ? 'bg-violet-600 text-white'
                                : 'bg-gray-800 text-gray-500'
                                }`}>
                                {step > s ? <CheckCircle className="w-4 h-4" /> : s}
                            </div>
                            {s < 3 && (
                                <div className={`flex-1 h-0.5 mx-2 transition-all ${step > s ? 'bg-violet-600' : 'bg-gray-800'
                                    }`} />
                            )}
                        </div>
                    ))}
                </div>
                <p className="text-center text-xs text-gray-400 py-2 border-b border-gray-800/30">
                    Step {step}: {stepTitles[step - 1]}
                </p>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* STEP 1: QR Code Display */}
                    {step === 1 && (
                        <div className="space-y-4">
                            {/* Wallet Selection */}
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    onClick={() => setWallet('GCash')}
                                    className={`py-3 rounded-xl font-medium text-xs transition-all ${wallet === 'GCash'
                                        ? 'bg-[#007DFE] text-white shadow-lg shadow-blue-900/30'
                                        : 'bg-[#1a1a1a] text-gray-400 border border-gray-800 hover:border-gray-700'
                                        }`}
                                >
                                    GCash
                                </button>
                                <button
                                    onClick={() => setWallet('Maya')}
                                    className={`py-3 rounded-xl font-medium text-xs transition-all ${wallet === 'Maya'
                                        ? 'bg-green-600 text-white shadow-lg shadow-green-900/30'
                                        : 'bg-[#1a1a1a] text-gray-400 border border-gray-800 hover:border-gray-700'
                                        }`}
                                >
                                    Maya
                                </button>
                                <button
                                    onClick={() => setWallet('Bank')}
                                    className={`py-3 rounded-xl font-medium text-xs transition-all ${wallet === 'Bank'
                                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30'
                                        : 'bg-[#1a1a1a] text-gray-400 border border-gray-800 hover:border-gray-700'
                                        }`}
                                >
                                    Bank
                                </button>
                            </div>

                            {wallet === 'Bank' && (
                                <select
                                    value={selectedBank}
                                    onChange={(e) => setSelectedBank(e.target.value)}
                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors text-sm"
                                >
                                    {bankOptions.map(bank => (
                                        <option key={bank} value={bank}>{bank}</option>
                                    ))}
                                </select>
                            )}

                            {/* QR Code */}
                            <div className="bg-white p-4 rounded-2xl shadow-xl mx-auto max-w-[250px]">
                                <div className="aspect-square relative rounded-xl overflow-hidden bg-gray-50">
                                    {imgSrc && (
                                        <Image
                                            src={imgSrc}
                                            alt={`${displayIdentifier} QR Code`}
                                            fill
                                            className="object-contain p-2"
                                            onError={() => {
                                                const dynamicApi = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=PAY-${unitCode.toUpperCase()}-${paymentIdentifier.toUpperCase()}-${amount}`;
                                                if (imgSrc !== dynamicApi) {
                                                    setImgSrc(dynamicApi);
                                                }
                                            }}
                                            unoptimized
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Account Details */}
                            <div className="bg-violet-900/10 border border-violet-500/20 rounded-xl p-4 text-center">
                                <p className="text-xs text-violet-200 mb-1">Send payment to</p>
                                <p className="text-lg font-bold text-white select-all">
                                    {accountDetails?.number || (
                                        wallet === 'GCash' ? '0917-XXX-XXXX' :
                                            wallet === 'Maya' ? '0918-XXX-XXXX' :
                                                `${selectedBank} Account`
                                    )}
                                </p>
                                {accountDetails?.name && (
                                    <p className="text-sm text-violet-300 font-medium mt-1">{accountDetails.name}</p>
                                )}
                            </div>

                            <div className="bg-amber-900/20 border border-amber-500/20 rounded-xl p-3 text-center">
                                <p className="text-xs text-amber-200">
                                    <span className="font-bold">Step 1:</span> Scan the QR code with your {displayIdentifier} app and complete the payment.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: Upload Proof & Reference */}
                    {step === 2 && (
                        <div className="space-y-4">
                            <div className="text-center mb-4">
                                <p className="text-sm text-gray-400">
                                    Upload a screenshot of your payment receipt. We'll automatically detect the reference number.
                                </p>
                            </div>

                            {/* Upload Area */}
                            <div className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center hover:border-violet-500/50 transition-colors bg-gray-900/20 relative group">
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleProofUpload}
                                    className="hidden"
                                    id="proof-upload"
                                    disabled={isOcrProcessing}
                                />
                                <label htmlFor="proof-upload" className="cursor-pointer block">
                                    {isOcrProcessing ? (
                                        <div className="flex flex-col items-center justify-center py-4 text-violet-400">
                                            <Loader2 className="w-10 h-10 animate-spin mb-3" />
                                            <p className="text-sm font-medium">{ocrStatus}</p>
                                        </div>
                                    ) : proofPreview ? (
                                        <div className="relative">
                                            <div className="w-full max-h-48 mx-auto relative rounded-lg overflow-hidden border border-gray-700 bg-gray-950">
                                                <img src={proofPreview} alt="Receipt" className="w-full h-full object-contain max-h-48" />
                                            </div>
                                            {ocrDetected ? (
                                                <p className="text-emerald-400 text-xs mt-3 flex items-center justify-center gap-1.5 font-medium">
                                                    <CheckCircle className="w-4 h-4" />
                                                    Reference detected: {referenceNumber}
                                                </p>
                                            ) : (
                                                <p className="text-amber-400 text-xs mt-3 flex items-center justify-center gap-1.5">
                                                    <AlertCircle className="w-4 h-4" />
                                                    {ocrStatus || 'Enter reference manually below'}
                                                </p>
                                            )}
                                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                                                <p className="text-white text-sm font-medium">Click to change</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-gray-500 py-6">
                                            <Camera className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                                            <p className="font-medium text-gray-300">Upload Payment Screenshot</p>
                                            <p className="text-xs mt-1 text-gray-500">We'll auto-detect the reference number</p>
                                        </div>
                                    )}
                                </label>
                            </div>

                            {/* Manual Reference Input */}
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-2 ml-1">
                                    Reference Number / Transaction ID <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={referenceNumber}
                                    onChange={(e) => setReferenceNumber(e.target.value)}
                                    placeholder="e.g. 1234567890123"
                                    className={`w-full bg-[#1a1a1a] border rounded-xl px-4 py-3 text-white focus:outline-none transition-colors text-sm font-mono ${ocrDetected ? 'border-emerald-500' : 'border-gray-800 focus:border-violet-500'
                                        }`}
                                />
                                {!proofPreview && (
                                    <p className="text-xs text-gray-600 mt-2 text-center">
                                        Or type the reference number manually if you prefer
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* STEP 3: Review & Confirm */}
                    {step === 3 && (
                        <div className="space-y-4">
                            <div className="text-center mb-4">
                                <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                                <h3 className="text-lg font-bold text-white">Review Your Payment</h3>
                            </div>

                            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400 text-sm">Amount</span>
                                    <span className="text-white font-bold text-lg">₱{amount.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400 text-sm">Payment Method</span>
                                    <span className="text-white font-medium">{displayIdentifier}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400 text-sm">Reference No.</span>
                                    <span className="text-violet-400 font-mono text-sm">{referenceNumber}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400 text-sm">Proof Attached</span>
                                    <span className={`font-medium ${proofFile ? 'text-emerald-400' : 'text-amber-400'}`}>
                                        {proofFile ? 'Yes' : 'No'}
                                    </span>
                                </div>
                            </div>

                            {proofPreview && (
                                <div className="bg-gray-900/30 border border-gray-800 rounded-xl p-3">
                                    <p className="text-xs text-gray-500 mb-2 text-center">Receipt Preview</p>
                                    <img src={proofPreview} alt="Receipt" className="w-full max-h-32 object-contain rounded-lg" />
                                </div>
                            )}

                            <div className="bg-emerald-900/20 border border-emerald-500/20 rounded-xl p-3 text-center">
                                <p className="text-xs text-emerald-200">
                                    Your payment will be sent for admin verification. You'll be notified once approved.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Navigation */}
                <div className="p-4 border-t border-gray-800/50 flex gap-3">
                    {step > 1 && (
                        <button
                            onClick={() => setStep(step - 1)}
                            disabled={isSubmitting}
                            className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Back
                        </button>
                    )}

                    {step < 3 ? (
                        <button
                            onClick={() => setStep(step + 1)}
                            disabled={step === 2 && !referenceNumber}
                            className="flex-1 py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            Next
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !referenceNumber}
                            className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Submitting...
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-5 h-5" />
                                    Submit Payment
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
