'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import { User, Phone, Save, Loader2, AlertCircle, CheckCircle, Shield } from 'lucide-react';

interface CustomerProfile {
    id: string;
    name: string;
    mobile_number: string;
}

export default function ProfilePage() {
    const params = useParams();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [profile, setProfile] = useState<CustomerProfile | null>(null);

    useEffect(() => {
        if (params.id) {
            fetchProfile();
        }
    }, [params.id]);

    const fetchProfile = async () => {
        try {
            const portalPath = `/portal/${params.id}`;

            // First get the subscription to find the customer ID
            const { data: subData, error: subError } = await supabase
                .from('subscriptions')
                .select('subscriber_id')
                .eq('customer_portal', portalPath)
                .single();

            if (subError) throw subError;
            if (!subData) throw new Error('Subscription not found');

            // Then fetch customer details
            const { data: customerData, error: customerError } = await supabase
                .from('customers')
                .select('id, name, mobile_number')
                .eq('id', subData.subscriber_id)
                .single();

            if (customerError) throw customerError;

            setProfile(customerData);
        } catch (err) {
            console.error('Error fetching profile:', err);
            setError('Unable to load profile information.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile) return;

        setIsSaving(true);
        setError('');
        setSuccessMessage('');

        try {
            const { error } = await supabase
                .from('customers')
                .update({
                    name: profile.name,
                    mobile_number: profile.mobile_number
                })
                .eq('id', profile.id);

            if (error) throw error;

            setSuccessMessage('Profile updated successfully');
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (err) {
            console.error('Error updating profile:', err);
            setError('Failed to update profile. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="tech-card p-8 max-w-md w-full text-center rounded-xl">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h1 className="text-xl font-bold text-white mb-2 neon-text">Profile Not Found</h1>
                    <p className="text-gray-400 font-mono text-sm">{error || 'Unable to load profile data'}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto animate-in fade-in duration-500">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white neon-text mb-2">Account Profile</h1>
                <p className="text-gray-400 font-mono text-sm">Manage your personal information</p>
            </div>

            <div className="tech-card p-8 rounded-xl relative overflow-hidden">
                {/* Background Decoration */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />

                <form onSubmit={handleSave} className="space-y-8 relative z-10">
                    <div className="flex flex-col md:flex-row gap-8 items-start">
                        {/* Avatar Section */}
                        <div className="flex-shrink-0 mx-auto md:mx-0">
                            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-gray-800 to-black border-2 border-red-500/30 flex items-center justify-center relative group">
                                <span className="text-4xl font-bold text-gray-500 group-hover:text-white transition-colors">
                                    {profile.name.charAt(0).toUpperCase()}
                                </span>
                                <div className="absolute inset-0 rounded-full bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <p className="text-center mt-3 text-xs text-gray-500 font-mono">CUSTOMER</p>
                        </div>

                        {/* Form Fields */}
                        <div className="flex-1 w-full space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2 font-mono uppercase">Full Name</label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <User className="h-5 w-5 text-gray-500 group-focus-within:text-red-500 transition-colors" />
                                    </div>
                                    <input
                                        type="text"
                                        value={profile.name}
                                        onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                                        className="block w-full pl-10 bg-[#0a0a0a] border border-gray-800 rounded-lg py-3 text-white placeholder-gray-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all font-sans"
                                        placeholder="Enter your full name"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2 font-mono uppercase">Mobile Number</label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Phone className="h-5 w-5 text-gray-500 group-focus-within:text-red-500 transition-colors" />
                                    </div>
                                    <input
                                        type="text"
                                        value={profile.mobile_number}
                                        onChange={(e) => setProfile({ ...profile, mobile_number: e.target.value })}
                                        className="block w-full pl-10 bg-[#0a0a0a] border border-gray-800 rounded-lg py-3 text-white placeholder-gray-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all font-sans"
                                        placeholder="Enter your mobile number"
                                    />
                                </div>
                            </div>

                            {/* Read-only Info */}
                            <div className="p-4 bg-white/5 rounded-lg border border-white/5">
                                <div className="flex items-start gap-3">
                                    <Shield className="w-5 h-5 text-gray-400 mt-0.5" />
                                    <div>
                                        <h4 className="text-sm font-medium text-gray-300 mb-1">Security Note</h4>
                                        <p className="text-xs text-gray-500">
                                            To update sensitive information like your installation address or plan details, please contact our support team directly.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between pt-6 border-t border-gray-800">
                        <div className="flex-1">
                            {error && (
                                <div className="flex items-center text-red-500 text-sm animate-in slide-in-from-left-2">
                                    <AlertCircle className="w-4 h-4 mr-2" />
                                    {error}
                                </div>
                            )}
                            {successMessage && (
                                <div className="flex items-center text-green-500 text-sm animate-in slide-in-from-left-2">
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    {successMessage}
                                </div>
                            )}
                        </div>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-lg font-medium transition-all hover:shadow-[0_0_20px_rgba(220,38,38,0.4)] flex items-center disabled:opacity-50 disabled:cursor-not-allowed group"
                        >
                            {isSaving ? (
                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            ) : (
                                <Save className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                            )}
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
