'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import { User, Phone, Save, Loader2, AlertCircle, CheckCircle, Shield, Mail, Calendar, Wifi, MapPin } from 'lucide-react';

interface SubscriptionInfo {
    id: string;
    plan_name: string;
    address: string;
    barangay: string;
    date_installed: string;
    active: boolean;
}

interface CustomerProfile {
    id: string;
    name: string;
    mobile_number: string;
    created_at: string;
    subscriptions: SubscriptionInfo[];
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
            const customerId = params.id as string;

            const { data: customerData, error: customerError } = await supabase
                .from('customers')
                .select('id, name, mobile_number, created_at')
                .eq('id', customerId)
                .single();

            if (customerError) throw customerError;
            if (!customerData) throw new Error('Customer not found');

            // Fetch subscriptions for this customer
            const { data: subscriptions } = await supabase
                .from('subscriptions')
                .select('id, address, barangay, date_installed, active, plans(name)')
                .eq('subscriber_id', customerId);

            const subsWithPlans = (subscriptions || []).map((sub: any) => ({
                id: sub.id,
                plan_name: Array.isArray(sub.plans) ? sub.plans[0]?.name : sub.plans?.name || 'Unknown',
                address: sub.address,
                barangay: sub.barangay,
                date_installed: sub.date_installed,
                active: sub.active
            }));

            setProfile({
                ...customerData,
                subscriptions: subsWithPlans
            });
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

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-900/30">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                    <p className="text-gray-400">Loading profile...</p>
                </div>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="glass-card p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-red-600 to-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-900/30">
                        <AlertCircle className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-xl font-bold text-white mb-2">Profile Not Found</h1>
                    <p className="text-gray-400">{error || 'Unable to load profile data'}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="glass-card p-6">
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    <User className="w-6 h-6 text-purple-500" />
                    Account Profile
                </h1>
                <p className="text-sm text-gray-400 mt-1">Manage your personal information and view account details</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Profile Form */}
                <div className="lg:col-span-2 glass-card p-6 relative overflow-hidden">
                    {/* Background Decoration */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-purple-600/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />

                    <form onSubmit={handleSave} className="relative z-10 space-y-6">
                        <div className="flex flex-col md:flex-row gap-6 items-start">
                            {/* Avatar Section */}
                            <div className="flex-shrink-0 mx-auto md:mx-0">
                                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-900/30">
                                    <span className="text-3xl font-bold text-white">
                                        {profile.name.charAt(0).toUpperCase()}
                                    </span>
                                </div>
                                <p className="text-center mt-2 text-xs text-gray-500 uppercase">Customer</p>
                            </div>

                            {/* Form Fields */}
                            <div className="flex-1 w-full space-y-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-2">Full Name</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <User className="h-5 w-5 text-gray-500" />
                                        </div>
                                        <input
                                            type="text"
                                            value={profile.name}
                                            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                                            className="block w-full pl-10 bg-gray-900/50 border border-gray-700 rounded-xl py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                                            placeholder="Enter your full name"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm text-gray-400 mb-2">Mobile Number</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Phone className="h-5 w-5 text-gray-500" />
                                        </div>
                                        <input
                                            type="text"
                                            value={profile.mobile_number}
                                            onChange={(e) => setProfile({ ...profile, mobile_number: e.target.value })}
                                            className="block w-full pl-10 bg-gray-900/50 border border-gray-700 rounded-xl py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                                            placeholder="Enter your mobile number"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Security Note */}
                        <div className="p-4 bg-purple-900/20 rounded-xl border border-purple-700/30">
                            <div className="flex items-start gap-3">
                                <Shield className="w-5 h-5 text-purple-400 mt-0.5" />
                                <div>
                                    <h4 className="text-sm font-medium text-gray-300 mb-1">Security Note</h4>
                                    <p className="text-xs text-gray-500">
                                        To update sensitive information like your installation address or plan details, please contact our support team directly.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                            <div className="flex-1">
                                {error && (
                                    <div className="flex items-center text-red-400 text-sm">
                                        <AlertCircle className="w-4 h-4 mr-2" />
                                        {error}
                                    </div>
                                )}
                                {successMessage && (
                                    <div className="flex items-center text-emerald-400 text-sm">
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                        {successMessage}
                                    </div>
                                )}
                            </div>
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white px-6 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-purple-900/30 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? (
                                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                ) : (
                                    <Save className="w-5 h-5 mr-2" />
                                )}
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Account Info Sidebar */}
                <div className="space-y-4">
                    {/* Account Details */}
                    <div className="glass-card p-5">
                        <h3 className="text-sm text-gray-400 uppercase mb-4">Account Details</h3>
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-purple-900/30 rounded-lg">
                                    <Calendar className="w-4 h-4 text-purple-400" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Member Since</p>
                                    <p className="text-sm text-white">{formatDate(profile.created_at)}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-900/30 rounded-lg">
                                    <Wifi className="w-4 h-4 text-emerald-400" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Active Subscriptions</p>
                                    <p className="text-sm text-white">{profile.subscriptions.filter(s => s.active).length}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Subscriptions List */}
                    <div className="glass-card p-5">
                        <h3 className="text-sm text-gray-400 uppercase mb-4">Your Plans</h3>
                        <div className="space-y-3">
                            {profile.subscriptions.map((sub) => (
                                <div key={sub.id} className="p-3 bg-[#0a0a0a] rounded-xl border border-gray-800">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-white font-medium">{sub.plan_name}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${sub.active
                                            ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/50'
                                            : 'bg-red-900/40 text-red-400 border border-red-700/50'
                                            }`}>
                                            {sub.active ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-gray-500">
                                        <MapPin className="w-3 h-3" />
                                        {sub.address}, {sub.barangay}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        Installed: {formatDate(sub.date_installed)}
                                    </div>
                                </div>
                            ))}
                            {profile.subscriptions.length === 0 && (
                                <p className="text-gray-500 text-sm text-center py-4">No subscriptions</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
