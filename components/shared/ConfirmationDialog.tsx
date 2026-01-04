'use client';

import { AlertCircle, AlertTriangle, CheckCircle, X } from 'lucide-react';

interface ConfirmationDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'warning' | 'danger' | 'info';
    isLoading?: boolean;
}

export default function ConfirmationDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    type = 'warning',
    isLoading = false
}: ConfirmationDialogProps) {
    if (!isOpen) return null;

    const typeStyles = {
        warning: {
            border: 'border-yellow-500/50',
            shadow: 'shadow-[0_0_50px_rgba(255,255,0,0.2)]',
            icon: <AlertTriangle className="w-8 h-8 text-yellow-500" />,
            buttonBg: 'bg-yellow-600 hover:bg-yellow-700'
        },
        danger: {
            border: 'border-red-500/50',
            shadow: 'shadow-[0_0_50px_rgba(255,0,0,0.2)]',
            icon: <AlertCircle className="w-8 h-8 text-red-500" />,
            buttonBg: 'bg-red-600 hover:bg-red-700'
        },
        info: {
            border: 'border-blue-500/50',
            shadow: 'shadow-[0_0_50px_rgba(0,100,255,0.2)]',
            icon: <CheckCircle className="w-8 h-8 text-blue-500" />,
            buttonBg: 'bg-blue-600 hover:bg-blue-700'
        }
    };

    const styles = typeStyles[type];

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
            <div className={`relative bg-[#0a0a0a] border-2 ${styles.border} rounded-xl ${styles.shadow} w-full max-w-md p-6`}>
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-3 mb-4">
                    {styles.icon}
                    <h3 className="text-xl font-bold text-white">{title}</h3>
                </div>

                <p className="text-gray-300 mb-6">{message}</p>

                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="flex-1 px-4 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors disabled:opacity-50"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className={`flex-1 px-4 py-2 ${styles.buttonBg} text-white rounded-lg transition-colors disabled:opacity-50`}
                    >
                        {isLoading ? 'Processing...' : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
