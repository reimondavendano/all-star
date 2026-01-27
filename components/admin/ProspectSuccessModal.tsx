'use client';

import { CheckCircle, XCircle, Clock, X } from 'lucide-react';
import type { ProspectStatus } from './ProspectStatusModal';

interface ProspectSuccessModalProps {
    isOpen: boolean;
    onClose: () => void;
    status: ProspectStatus;
    customerName: string;
}

export default function ProspectSuccessModal({
    isOpen,
    onClose,
    status,
    customerName
}: ProspectSuccessModalProps) {
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
                    iconBg: 'bg-green-900/30',
                    title: 'Subscription Created Successfully!',
                    message: 'The subscription has been created and the prospect has been marked as Closed Won.'
                };
            case 'Open':
                return {
                    icon: Clock,
                    color: 'blue',
                    bgColor: 'bg-blue-500/10',
                    borderColor: 'border-blue-500/50',
                    textColor: 'text-blue-400',
                    iconBg: 'bg-blue-900/30',
                    title: 'Subscription Created!',
                    message: 'The subscription has been created and the prospect remains Open for follow-up.'
                };
            case 'Closed Lost':
                return {
                    icon: XCircle,
                    color: 'red',
                    bgColor: 'bg-red-500/10',
                    borderColor: 'border-red-500/50',
                    textColor: 'text-red-400',
                    iconBg: 'bg-red-900/30',
                    title: 'Subscription Recorded',
                    message: 'The subscription has been created and the prospect has been marked as Closed Lost.'
                };
        }
    };

    const statusConfig = getStatusConfig();
    const StatusIcon = statusConfig.icon;

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" />

            <div className="relative bg-[#0a0a0a] border border-purple-900/50 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-full z-10"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Content */}
                <div className="p-8 text-center">
                    {/* Icon */}
                    <div className={`w-20 h-20 rounded-full ${statusConfig.iconBg} border-2 ${statusConfig.borderColor} flex items-center justify-center mx-auto mb-6 animate-in zoom-in duration-300`}>
                        <StatusIcon className={`w-10 h-10 ${statusConfig.textColor}`} />
                    </div>

                    {/* Title */}
                    <h3 className="text-2xl font-bold text-white mb-3">
                        {statusConfig.title}
                    </h3>

                    {/* Customer Name */}
                    <p className="text-lg text-gray-300 mb-4">
                        <span className="text-purple-400 font-medium">{customerName}</span>
                    </p>

                    {/* Message */}
                    <p className="text-gray-400 mb-6">
                        {statusConfig.message}
                    </p>

                    {/* Status Badge */}
                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${statusConfig.bgColor} border ${statusConfig.borderColor} mb-6`}>
                        <StatusIcon className={`w-4 h-4 ${statusConfig.textColor}`} />
                        <span className={`text-sm font-medium ${statusConfig.textColor}`}>
                            Status: {status}
                        </span>
                    </div>

                    {/* Action Button */}
                    <button
                        onClick={onClose}
                        className="w-full px-6 py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-lg transition-all shadow-lg shadow-purple-900/30 font-medium"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
