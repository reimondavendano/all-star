'use client';

import { CheckCircle, XCircle, Clock, User, MapPin, Wifi, FileText, Calendar } from 'lucide-react';
import type { ProspectStatus } from './ProspectStatusModal';

interface ProspectConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    status: ProspectStatus;
    subscriptionData: {
        customerName: string;
        customerMobile: string;
        businessUnit: string;
        plan: string;
        planFee: number;
        address: string;
        barangay: string;
        landmark: string;
        dateInstalled: string;
        invoiceDate: string;
        referrer?: string;
        active: boolean;
    };
}

export default function ProspectConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    status,
    subscriptionData
}: ProspectConfirmationModalProps) {
    if (!isOpen) return null;

    const getStatusConfig = () => {
        switch (status) {
            case 'Closed Won':
                return {
                    icon: CheckCircle,
                    color: 'green',
                    bgColor: 'bg-green-500/10',
                    borderColor: 'border-green-500/50',
                    textColor: 'text-green-400',
                    iconBg: 'bg-green-900/30'
                };
            case 'Open':
                return {
                    icon: Clock,
                    color: 'blue',
                    bgColor: 'bg-blue-500/10',
                    borderColor: 'border-blue-500/50',
                    textColor: 'text-blue-400',
                    iconBg: 'bg-blue-900/30'
                };
            case 'Closed Lost':
                return {
                    icon: XCircle,
                    color: 'red',
                    bgColor: 'bg-red-500/10',
                    borderColor: 'border-red-500/50',
                    textColor: 'text-red-400',
                    iconBg: 'bg-red-900/30'
                };
        }
    };

    const statusConfig = getStatusConfig();
    const StatusIcon = statusConfig.icon;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-[#0a0a0a] border border-purple-900/50 rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className={`p-6 ${statusConfig.bgColor} border-b ${statusConfig.borderColor}`}>
                    <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-lg ${statusConfig.iconBg}`}>
                            <StatusIcon className={`w-8 h-8 ${statusConfig.textColor}`} />
                        </div>
                        <div>
                            <h3 className="text-2xl font-bold text-white mb-1">Confirm Subscription Details</h3>
                            <p className="text-gray-400">
                                Status: <span className={`font-medium ${statusConfig.textColor}`}>{status}</span>
                            </p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Customer Information */}
                    <div className="bg-[#151515] border border-gray-800 rounded-xl p-5">
                        <div className="flex items-center gap-3 mb-4 text-purple-400">
                            <User className="w-5 h-5" />
                            <h4 className="text-lg font-semibold">Customer Information</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs text-gray-500 mb-1">Full Name</p>
                                <p className="text-white font-medium">{subscriptionData.customerName}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 mb-1">Mobile Number</p>
                                <p className="text-white font-medium">{subscriptionData.customerMobile}</p>
                            </div>
                        </div>
                    </div>

                    {/* Location Information */}
                    <div className="bg-[#151515] border border-gray-800 rounded-xl p-5">
                        <div className="flex items-center gap-3 mb-4 text-blue-400">
                            <MapPin className="w-5 h-5" />
                            <h4 className="text-lg font-semibold">Installation Address</h4>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <p className="text-xs text-gray-500 mb-1">Barangay</p>
                                <p className="text-white">{subscriptionData.barangay || 'Not specified'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 mb-1">Detailed Address</p>
                                <p className="text-white">{subscriptionData.address || 'Not specified'}</p>
                            </div>
                            {subscriptionData.landmark && (
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Landmark</p>
                                    <p className="text-white">{subscriptionData.landmark}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Plan Information */}
                    <div className="bg-[#151515] border border-gray-800 rounded-xl p-5">
                        <div className="flex items-center gap-3 mb-4 text-green-400">
                            <Wifi className="w-5 h-5" />
                            <h4 className="text-lg font-semibold">Plan & Service Details</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs text-gray-500 mb-1">Business Unit</p>
                                <p className="text-white font-medium">{subscriptionData.businessUnit}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 mb-1">Selected Plan</p>
                                <p className="text-white font-medium">{subscriptionData.plan}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 mb-1">Monthly Fee</p>
                                <p className="text-white font-medium text-lg">₱{subscriptionData.planFee.toLocaleString()}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 mb-1">Billing Period</p>
                                <p className="text-white font-medium">{subscriptionData.invoiceDate}</p>
                            </div>
                        </div>
                    </div>

                    {/* Additional Information */}
                    <div className="bg-[#151515] border border-gray-800 rounded-xl p-5">
                        <div className="flex items-center gap-3 mb-4 text-amber-400">
                            <FileText className="w-5 h-5" />
                            <h4 className="text-lg font-semibold">Additional Details</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs text-gray-500 mb-1">Installation Date</p>
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-gray-500" />
                                    <p className="text-white">{new Date(subscriptionData.dateInstalled).toLocaleDateString()}</p>
                                </div>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 mb-1">Connection Status</p>
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${subscriptionData.active ? 'bg-green-500' : 'bg-gray-500'}`} />
                                    <p className={subscriptionData.active ? 'text-green-400' : 'text-gray-400'}>
                                        {subscriptionData.active ? 'Active' : 'Inactive'}
                                    </p>
                                </div>
                            </div>
                            {subscriptionData.referrer && (
                                <div className="col-span-2">
                                    <p className="text-xs text-gray-500 mb-1">Referred By</p>
                                    <p className="text-white">{subscriptionData.referrer}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Warning/Info Box */}
                    <div className={`p-4 rounded-lg border ${statusConfig.borderColor} ${statusConfig.bgColor}`}>
                        <p className="text-sm text-gray-300">
                            {status === 'Closed Won' && (
                                <>
                                    <strong className={statusConfig.textColor}>Closed Won:</strong> This subscription will be created and the prospect status will be marked as successfully converted.
                                </>
                            )}
                            {status === 'Open' && (
                                <>
                                    <strong className={statusConfig.textColor}>Open:</strong> This subscription will be created but the prospect will remain in open status for follow-up.
                                </>
                            )}
                            {status === 'Closed Lost' && (
                                <>
                                    <strong className={statusConfig.textColor}>Closed Lost:</strong> This subscription will be created but the prospect will be marked as lost. This is typically used for record-keeping purposes.
                                </>
                            )}
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-800 bg-[#0f0f0f] flex gap-3 justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
                    >
                        Go Back
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-6 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-purple-900/30`}
                    >
                        <CheckCircle className="w-4 h-4" />
                        Yes, Confirm Subscription
                    </button>
                </div>
            </div>
        </div>
    );
}
