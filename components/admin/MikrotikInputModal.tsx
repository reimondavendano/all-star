'use client';

import { useState, useEffect } from 'react';
import { Globe, ChevronRight, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface MikrotikInputModalProps {
    isOpen: boolean;
    onClose: () => void;
    onContinue: (mikrotikData: MikrotikData) => void;
    customerName: string;
    suggestedUsername?: string;
}

export interface MikrotikData {
    enabled: boolean;
    name: string;
    password: string;
    service: string;
    profile: string;
    comment: string;
    addToRouter: boolean;
}

export default function MikrotikInputModal({
    isOpen,
    onClose,
    onContinue,
    customerName,
    suggestedUsername
}: MikrotikInputModalProps) {
    const [profiles, setProfiles] = useState<string[]>([]);
    const [formData, setFormData] = useState<MikrotikData>({
        enabled: true,
        name: suggestedUsername || '',
        password: '',
        service: 'pppoe',
        profile: '100MBPS',
        comment: `Converted from prospect: ${customerName}`,
        addToRouter: false
    });

    useEffect(() => {
        if (isOpen) {
            fetchProfiles();
            // Set suggested username if provided
            if (suggestedUsername) {
                setFormData(prev => ({
                    ...prev,
                    name: suggestedUsername,
                    comment: `Converted from prospect: ${customerName}`
                }));
            }
        }
    }, [isOpen, suggestedUsername, customerName]);

    const fetchProfiles = async () => {
        try {
            // Fetch available profiles from plans table
            const { data, error } = await supabase
                .from('plans')
                .select('name')
                .order('name');

            if (error) throw error;

            const profileNames = data?.map(p => p.name) || [];
            setProfiles(profileNames.length > 0 ? profileNames : ['100MBPS', '200MBPS', '500MBPS', '1GBPS']);
        } catch (error) {
            console.error('Error fetching profiles:', error);
            // Fallback profiles
            setProfiles(['100MBPS', '200MBPS', '500MBPS', '1GBPS']);
        }
    };

    const handleSubmit = () => {
        // Validation
        if (!formData.name.trim()) {
            alert('Username is required');
            return;
        }
        if (!formData.password.trim()) {
            alert('Password is required');
            return;
        }

        onContinue(formData);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-[#0a0a0a] border border-blue-900/50 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
                {/* Header */}
                <div className="p-6 bg-gradient-to-r from-blue-900/20 to-purple-900/20 border-b border-gray-800">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-900/30 rounded-lg">
                            <Globe className="w-8 h-8 text-blue-400" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-bold text-white mb-1">Create MikroTik User</h3>
                            <p className="text-gray-400">
                                Configure the PPP secret that will be created in MikroTik for{' '}
                                <span className="text-blue-400 font-medium">{customerName}</span>
                            </p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
                    {/* Enabled Toggle */}
                    <div className="flex items-center justify-between p-4 bg-[#151515] border border-gray-800 rounded-xl">
                        <div>
                            <label className="text-sm font-medium text-white">Enabled</label>
                            <p className="text-xs text-gray-500 mt-1">PPP secret will be active immediately</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={formData.enabled}
                                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                            />
                            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>

                    {/* Name (Username) */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            Name (Username) <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g., JUAN"
                            className="w-full bg-[#151515] border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors font-mono"
                        />
                    </div>

                    {/* Password */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            Password <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            placeholder="e.g., 1111"
                            className="w-full bg-[#151515] border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors font-mono"
                        />
                    </div>

                    {/* Service */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Service</label>
                        <select
                            value={formData.service}
                            onChange={(e) => setFormData({ ...formData, service: e.target.value })}
                            className="w-full bg-[#151515] border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                        >
                            <option value="any">Any</option>
                            <option value="pppoe">PPPoE</option>
                            <option value="pptp">PPTP</option>
                            <option value="l2tp">L2TP</option>
                            <option value="sstp">SSTP</option>
                        </select>
                    </div>

                    {/* Profile */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Profile</label>
                        <select
                            value={formData.profile}
                            onChange={(e) => setFormData({ ...formData, profile: e.target.value })}
                            className="w-full bg-[#151515] border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                        >
                            {profiles.map(profile => (
                                <option key={profile} value={profile}>{profile}</option>
                            ))}
                        </select>
                    </div>

                    {/* Comment */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Comment</label>
                        <textarea
                            value={formData.comment}
                            onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                            rows={2}
                            className="w-full bg-[#151515] border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors resize-none"
                        />
                    </div>

                    {/* Add to Router Checkbox */}
                    <div className="flex items-start gap-3 p-4 bg-amber-900/10 border border-amber-700/30 rounded-xl">
                        <input
                            type="checkbox"
                            id="addToRouter"
                            checked={formData.addToRouter}
                            onChange={(e) => setFormData({ ...formData, addToRouter: e.target.checked })}
                            className="mt-1 w-4 h-4 text-amber-600 focus:ring-amber-600 bg-gray-900 border-gray-700 rounded"
                        />
                        <div className="flex-1">
                            <label htmlFor="addToRouter" className="text-sm font-medium text-white cursor-pointer">
                                Also add to MikroTik Router
                            </label>
                            <div className="flex items-start gap-2 mt-1">
                                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-400">
                                    Will only save to database (recommended for testing)
                                </p>
                            </div>
                        </div>
                    </div>
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
                        onClick={handleSubmit}
                        className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-blue-900/30"
                    >
                        Next: Review
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
