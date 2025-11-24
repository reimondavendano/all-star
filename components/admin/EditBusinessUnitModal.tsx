'use client';

import React, { useState, useEffect } from 'react';
import { X, Loader2, Save, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface BusinessUnit {
    id: string;
    name: string;
    subscribers: number;
    created_at: string;
}

interface EditBusinessUnitModalProps {
    isOpen: boolean;
    onClose: () => void;
    businessUnit: BusinessUnit;
    onUpdate: () => void;
}

export default function EditBusinessUnitModal({ isOpen, onClose, businessUnit, onUpdate }: EditBusinessUnitModalProps) {
    const [formData, setFormData] = useState({
        name: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        if (businessUnit) {
            setFormData({
                name: businessUnit.name || ''
            });
        }
    }, [businessUnit]);

    if (!isOpen) return null;

    const handleUpdateClick = () => {
        setShowConfirmation(true);
    };

    const handleConfirmUpdate = async () => {
        setIsLoading(true);
        setShowConfirmation(false);

        try {
            const { error } = await supabase
                .from('business_units')
                .update({
                    name: formData.name
                })
                .eq('id', businessUnit.id);

            if (error) throw error;

            setShowSuccess(true);
        } catch (error) {
            console.error('Error updating business unit:', error);
            alert('Failed to update business unit');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCloseSuccess = () => {
        setShowSuccess(false);
        onUpdate();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-[#0a0a0a] border border-gray-800 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-800">
                    <div>
                        <h2 className="text-xl font-bold text-white">Edit Business Unit</h2>
                        <p className="text-sm text-gray-500 mt-1">Update business unit details</p>
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
                    {/* Business Unit ID (Read-only) */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-500 uppercase">Business Unit ID</label>
                        <div className="p-3 bg-gray-900/50 border border-gray-800 rounded-lg text-gray-400 font-mono text-sm">
                            {businessUnit.id}
                        </div>
                    </div>

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
                        onClick={handleUpdateClick}
                        disabled={isLoading}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        Update Business Unit
                    </button>
                </div>
            </div>

            {/* Confirmation Modal */}
            {showConfirmation && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowConfirmation(false)} />
                    <div className="relative bg-[#0a0a0a] border border-red-500/30 rounded-xl shadow-[0_0_50px_rgba(255,0,0,0.3)] w-full max-w-md p-6">
                        <h3 className="text-xl font-bold text-white mb-2">Confirm Update</h3>
                        <p className="text-gray-400 mb-6">
                            Are you sure you want to update this business unit?
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowConfirmation(false)}
                                className="flex-1 px-4 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmUpdate}
                                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                            >
                                Confirm Update
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Modal */}
            {showSuccess && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                    <div className="relative bg-[#0a0a0a] border border-green-500/30 rounded-xl shadow-[0_0_50px_rgba(0,255,0,0.2)] w-full max-w-md p-6 text-center">
                        <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Save className="w-8 h-8 text-green-500" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">Update Successful</h3>
                        <p className="text-gray-400 mb-6">
                            The business unit has been successfully updated.
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
