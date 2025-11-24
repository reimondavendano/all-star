'use client';

import React, { useState } from 'react';
import { X, Loader2, Plus, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface AddBusinessUnitModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function AddBusinessUnitModal({ isOpen, onClose, onSuccess }: AddBusinessUnitModalProps) {
    const [formData, setFormData] = useState({
        name: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!formData.name) {
            alert('Please fill in all fields');
            return;
        }

        setIsLoading(true);

        try {
            const { error } = await supabase
                .from('business_units')
                .insert([{
                    name: formData.name
                }]);

            if (error) throw error;

            setShowSuccess(true);
        } catch (error) {
            console.error('Error adding business unit:', error);
            alert('Failed to add business unit');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCloseSuccess = () => {
        setShowSuccess(false);
        setFormData({ name: '' });
        onSuccess();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-[#0a0a0a] border border-gray-800 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-800">
                    <div>
                        <h2 className="text-xl font-bold text-white">Add Business Unit</h2>
                        <p className="text-sm text-gray-500 mt-1">Create a new business unit</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Name */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-500 uppercase">Name</label>
                        <div className="relative">
                            <Building2 className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg pl-10 pr-4 py-3 text-white focus:outline-none focus:border-red-500 transition-colors"
                                placeholder="Enter business unit name"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isLoading}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Plus className="w-4 h-4" />
                        )}
                        Add Business Unit
                    </button>
                </div>
            </div>

            {/* Success Modal */}
            {showSuccess && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                    <div className="relative bg-[#0a0a0a] border border-green-500/30 rounded-xl shadow-[0_0_50px_rgba(0,255,0,0.2)] w-full max-w-md p-6 text-center">
                        <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Plus className="w-8 h-8 text-green-500" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">Business Unit Added</h3>
                        <p className="text-gray-400 mb-6">
                            The new business unit has been successfully added.
                        </p>
                        <button
                            onClick={handleCloseSuccess}
                            className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
