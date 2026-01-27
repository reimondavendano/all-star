'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, Clock, ChevronRight } from 'lucide-react';

export type ProspectStatus = 'Open' | 'Closed Lost' | 'Closed Won';

interface ProspectStatusModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectStatus: (status: ProspectStatus) => void;
    customerName: string;
}

export default function ProspectStatusModal({ 
    isOpen, 
    onClose, 
    onSelectStatus,
    customerName 
}: ProspectStatusModalProps) {
    const [selectedStatus, setSelectedStatus] = useState<ProspectStatus | null>(null);

    const handleContinue = () => {
        if (selectedStatus) {
            onSelectStatus(selectedStatus);
        }
    };

    if (!isOpen) return null;

    const statusOptions = [
        {
            value: 'Closed Won' as ProspectStatus,
            label: 'Closed Won',
            description: 'Customer accepted and subscription is confirmed',
            icon: CheckCircle,
            color: 'green',
            bgColor: 'bg-green-500/10',
            borderColor: 'border-green-500/50',
            textColor: 'text-green-400',
            iconBg: 'bg-green-900/30'
        },
        {
            value: 'Open' as ProspectStatus,
            label: 'Open',
            description: 'Still in negotiation or pending decision',
            icon: Clock,
            color: 'blue',
            bgColor: 'bg-blue-500/10',
            borderColor: 'border-blue-500/50',
            textColor: 'text-blue-400',
            iconBg: 'bg-blue-900/30'
        },
        {
            value: 'Closed Lost' as ProspectStatus,
            label: 'Closed Lost',
            description: 'Customer declined or deal did not proceed',
            icon: XCircle,
            color: 'red',
            bgColor: 'bg-red-500/10',
            borderColor: 'border-red-500/50',
            textColor: 'text-red-400',
            iconBg: 'bg-red-900/30'
        }
    ];

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
            
            <div className="relative bg-[#0a0a0a] border border-purple-900/50 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
                {/* Header */}
                <div className="p-6 bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-b border-gray-800">
                    <h3 className="text-2xl font-bold text-white mb-2">Prospect Status Verification</h3>
                    <p className="text-gray-400">
                        Select the status for <span className="text-purple-400 font-medium">{customerName}</span>
                    </p>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    {statusOptions.map((option) => {
                        const Icon = option.icon;
                        const isSelected = selectedStatus === option.value;

                        return (
                            <button
                                key={option.value}
                                onClick={() => setSelectedStatus(option.value)}
                                className={`w-full p-5 rounded-xl border-2 transition-all text-left ${
                                    isSelected
                                        ? `${option.borderColor} ${option.bgColor} shadow-lg`
                                        : 'border-gray-800 bg-[#151515] hover:border-gray-700'
                                }`}
                            >
                                <div className="flex items-start gap-4">
                                    <div className={`p-3 rounded-lg ${isSelected ? option.iconBg : 'bg-gray-900'}`}>
                                        <Icon className={`w-6 h-6 ${isSelected ? option.textColor : 'text-gray-500'}`} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                            <h4 className={`text-lg font-semibold ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                                                {option.label}
                                            </h4>
                                            {isSelected && (
                                                <div className={`w-6 h-6 rounded-full ${option.bgColor} border-2 ${option.borderColor} flex items-center justify-center`}>
                                                    <CheckCircle className={`w-4 h-4 ${option.textColor}`} />
                                                </div>
                                            )}
                                        </div>
                                        <p className={`text-sm ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}>
                                            {option.description}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-800 bg-[#0f0f0f] flex gap-3 justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleContinue}
                        disabled={!selectedStatus}
                        className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-purple-900/30"
                    >
                        Continue
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
