'use client';

import { useState, useEffect } from 'react';
import { Loader2, CheckCircle, FileText, AlertTriangle, Globe, ChevronRight } from 'lucide-react';
import { processActivation } from '@/app/actions/activation';
import { supabase } from '@/lib/supabase';
import { addPppSecret } from '@/app/actions/mikrotik';

interface ActivationModalProps {
    isOpen: boolean;
    onClose: () => void;
    subscription: {
        id: string;
        subscriber_id?: string;
        customer_name?: string;
        business_unit_name?: string;
        plan_name?: string;
    };
    onConfirm: () => void;
}

interface MikrotikData {
    enabled: boolean;
    name: string;
    password: string;
    service: string;
    profile: string;
    comment: string;
    addToRouter: boolean;
}

export default function ActivationModal({ isOpen, onClose, subscription, onConfirm }: ActivationModalProps) {
    const [step, setStep] = useState<'mikrotik' | 'confirm' | 'success'>('mikrotik');
    const [isLoading, setIsLoading] = useState(false);
    const [generateInvoice, setGenerateInvoice] = useState(true);
    const [activationDate, setActivationDate] = useState(new Date().toISOString().split('T')[0]);
    const [error, setError] = useState<string | null>(null);
    const [hasMikrotikAccount, setHasMikrotikAccount] = useState(false);
    const [profiles, setProfiles] = useState<string[]>([]);

    // MikroTik form data
    const [mikrotikData, setMikrotikData] = useState<MikrotikData>({
        enabled: true,
        name: '',
        password: '1111',
        service: 'pppoe',
        profile: subscription.plan_name || '100MBPS',
        comment: `Activated: ${subscription.customer_name}`,
        addToRouter: false
    });

    // Check if MikroTik account already exists and fetch profiles
    useEffect(() => {
        if (isOpen) {
            checkExistingMikrotikAccount();
            fetchProfiles();
            // Reset step when modal opens
            setStep('mikrotik');
            setError(null);
            // Set suggested username
            if (subscription.customer_name) {
                const suggestedName = subscription.customer_name.split(' ')[0].toUpperCase();
                setMikrotikData(prev => ({
                    ...prev,
                    name: suggestedName,
                    profile: subscription.plan_name || '100MBPS',
                    comment: `Activated: ${subscription.customer_name}`
                }));
            }
        }
    }, [isOpen, subscription]);

    const checkExistingMikrotikAccount = async () => {
        try {
            const { data } = await supabase
                .from('mikrotik_ppp_secrets')
                .select('id')
                .eq('subscription_id', subscription.id)
                .single();

            if (data) {
                setHasMikrotikAccount(true);
                setStep('confirm'); // Skip MikroTik step if account exists
            } else {
                setHasMikrotikAccount(false);
                setStep('mikrotik');
            }
        } catch {
            setHasMikrotikAccount(false);
        }
    };

    const fetchProfiles = async () => {
        try {
            const { data, error } = await supabase
                .from('plans')
                .select('name')
                .order('name');

            if (error) throw error;

            const profileNames = data?.map(p => p.name) || [];
            setProfiles(profileNames.length > 0 ? profileNames : ['100MBPS', '200MBPS', '500MBPS', '1GBPS']);
        } catch {
            setProfiles(['100MBPS', '200MBPS', '500MBPS', '1GBPS']);
        }
    };

    const handleMikrotikContinue = () => {
        // Validation
        if (!mikrotikData.name.trim()) {
            setError('Username is required');
            return;
        }
        if (!mikrotikData.password.trim()) {
            setError('Password is required');
            return;
        }
        setError(null);
        setStep('confirm');
    };

    const handleActivate = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const date = new Date(activationDate);

            // Create MikroTik PPP Secret if not already exists
            if (!hasMikrotikAccount) {
                try {
                    // Save to database
                    const { error: pppError } = await supabase
                        .from('mikrotik_ppp_secrets')
                        .insert({
                            subscription_id: subscription.id,
                            customer_id: subscription.subscriber_id || null,
                            name: mikrotikData.name,
                            password: mikrotikData.password,
                            service: mikrotikData.service,
                            profile: mikrotikData.profile,
                            comment: mikrotikData.comment,
                            enabled: mikrotikData.enabled
                        });

                    if (pppError) throw pppError;

                    // Add to MikroTik router if requested
                    if (mikrotikData.addToRouter) {
                        const mtResult = await addPppSecret({
                            name: mikrotikData.name,
                            password: mikrotikData.password,
                            service: mikrotikData.service,
                            profile: mikrotikData.profile,
                            comment: mikrotikData.comment
                        });

                        if (!mtResult.success) {
                            console.warn('MikroTik creation warning:', mtResult.error);
                        }
                    }
                } catch (pppError) {
                    console.error('Error creating MikroTik PPP:', pppError);
                    // Don't fail the whole operation, just log the error
                }
            }

            // Process activation
            const result = await processActivation(
                subscription.id,
                date,
                generateInvoice
            );

            if (!result.success) {
                throw new Error(result.error || 'Failed to process activation');
            }

            // Update related prospect to Closed Won if exists
            if (subscription.subscriber_id) {
                const { data: customer } = await supabase
                    .from('customers')
                    .select('mobile_number')
                    .eq('id', subscription.subscriber_id)
                    .single();

                if (customer?.mobile_number) {
                    await supabase
                        .from('prospects')
                        .update({ status: 'Closed Won' })
                        .eq('mobile_number', customer.mobile_number)
                        .eq('status', 'Open');
                }
            }

            onConfirm();
            setStep('success');

        } catch (error) {
            console.error('Activation error:', error);
            setError(error instanceof Error ? error.message : 'Unknown error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleClose = () => {
        setStep('mikrotik');
        setError(null);
        setMikrotikData({
            enabled: true,
            name: '',
            password: '',
            service: 'pppoe',
            profile: '100MBPS',
            comment: '',
            addToRouter: false
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={handleClose} />
            <div className="relative bg-[#0a0a0a] border border-green-900/50 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-6 bg-green-950/20 border-b border-green-900/30 flex items-start gap-4">
                    <div className="p-3 bg-green-900/20 rounded-lg">
                        {step === 'mikrotik' ? (
                            <Globe className="w-6 h-6 text-blue-400" />
                        ) : (
                            <CheckCircle className="w-6 h-6 text-green-500" />
                        )}
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">
                            {step === 'mikrotik' ? 'Create MikroTik Account' : 'Enable this subscription?'}
                        </h3>
                        <p className="text-sm text-gray-400 mt-1">
                            {subscription.customer_name} • {subscription.business_unit_name}
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6 overflow-y-auto flex-1">
                    {/* MikroTik Step */}
                    {step === 'mikrotik' && (
                        <div className="space-y-5">
                            {error && (
                                <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-lg flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-red-400">{error}</div>
                                </div>
                            )}

                            <p className="text-sm text-gray-400">
                                Configure the MikroTik PPP credentials for this subscription before activation.
                            </p>

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
                                        checked={mikrotikData.enabled}
                                        onChange={(e) => setMikrotikData({ ...mikrotikData, enabled: e.target.checked })}
                                    />
                                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                                </label>
                            </div>

                            {/* Name (Username) */}
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    Name (Username) <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={mikrotikData.name}
                                    onChange={(e) => setMikrotikData({ ...mikrotikData, name: e.target.value })}
                                    placeholder="e.g., JUAN"
                                    className="w-full bg-[#151515] border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-500 transition-colors font-mono"
                                />
                            </div>

                            {/* Password */}
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    Password <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={mikrotikData.password}
                                    onChange={(e) => setMikrotikData({ ...mikrotikData, password: e.target.value })}
                                    placeholder="1111"
                                    className="w-full bg-[#151515] border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-500 transition-colors font-mono"
                                />
                            </div>

                            {/* Service */}
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Service</label>
                                <select
                                    value={mikrotikData.service}
                                    onChange={(e) => setMikrotikData({ ...mikrotikData, service: e.target.value })}
                                    className="w-full bg-[#151515] border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-500 transition-colors"
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
                                    value={mikrotikData.profile}
                                    onChange={(e) => setMikrotikData({ ...mikrotikData, profile: e.target.value })}
                                    className="w-full bg-[#151515] border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-500 transition-colors"
                                >
                                    {profiles.map(profile => (
                                        <option key={profile} value={profile}>{profile}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Add to Router Checkbox */}
                            <div className="flex items-start gap-3 p-4 bg-amber-900/10 border border-amber-700/30 rounded-xl">
                                <input
                                    type="checkbox"
                                    id="addToRouter"
                                    checked={mikrotikData.addToRouter}
                                    onChange={(e) => setMikrotikData({ ...mikrotikData, addToRouter: e.target.checked })}
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
                    )}

                    {/* Confirm Step */}
                    {step === 'confirm' && (
                        <div className="space-y-4">
                            {error && (
                                <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-lg flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-red-400">
                                        <div className="font-semibold">Error</div>
                                        {error}
                                    </div>
                                </div>
                            )}

                            {/* MikroTik Summary */}
                            {!hasMikrotikAccount && (
                                <div className="p-4 bg-blue-900/20 border border-blue-900/50 rounded-lg">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Globe className="w-4 h-4 text-blue-400" />
                                        <span className="text-sm font-medium text-blue-400">MikroTik Account</span>
                                    </div>
                                    <div className="text-sm text-gray-300 font-mono">
                                        {mikrotikData.name} / {mikrotikData.password}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        Profile: {mikrotikData.profile} • Service: {mikrotikData.service}
                                    </div>
                                </div>
                            )}

                            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                                <p className="text-sm text-gray-300 mb-4">
                                    Are you sure you want to enable this subscription? This will activate the service immediately.
                                </p>

                                <div className="space-y-3">
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-gray-500">Activation Date</label>
                                        <input
                                            type="date"
                                            value={activationDate}
                                            onChange={(e) => setActivationDate(e.target.value)}
                                            max={new Date().toISOString().split('T')[0]}
                                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-green-500 outline-none"
                                        />
                                        <p className="text-xs text-gray-500">
                                            The date when the service will be activated
                                        </p>
                                    </div>

                                    <label className="flex items-start gap-3 p-4 rounded-lg bg-[#151515] border border-gray-800 cursor-pointer hover:border-gray-700 transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={generateInvoice}
                                            onChange={(e) => setGenerateInvoice(e.target.checked)}
                                            className="mt-0.5 w-4 h-4 text-green-600 focus:ring-green-600 bg-gray-900 border-gray-700 rounded"
                                        />
                                        <div className="flex-1">
                                            <div className="font-medium text-white">Generate Activation Invoice</div>
                                            <div className="text-xs text-gray-500 mt-1">
                                                Automatically create an invoice for the period from the activation date to the next billing date.
                                            </div>
                                        </div>
                                    </label>
                                </div>

                                {generateInvoice && (
                                    <div className="mt-4 p-3 bg-blue-950/30 border border-blue-900/50 rounded-lg">
                                        <div className="flex items-start gap-2">
                                            <FileText className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                                            <div className="text-xs text-blue-300">
                                                <strong>Invoice will be generated automatically</strong>
                                                <p className="mt-1 text-blue-400/80">
                                                    The system will calculate the prorated amount from {new Date(activationDate).toLocaleDateString()} to your next billing date based on {subscription.business_unit_name}.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle className="w-8 h-8 text-green-500" />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">Activation Complete</h3>
                            <p className="text-sm text-gray-400">
                                The subscription has been activated successfully.
                                {generateInvoice && ' An activation invoice has been generated.'}
                                {!hasMikrotikAccount && ' MikroTik account has been created.'}
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-800 bg-[#0f0f0f] flex gap-3 justify-end">
                    {step === 'mikrotik' ? (
                        <>
                            <button
                                onClick={handleClose}
                                className="px-4 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleMikrotikContinue}
                                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-500 hover:to-green-500 text-white rounded-lg transition-all flex items-center gap-2"
                            >
                                Next: Activation
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </>
                    ) : step === 'confirm' ? (
                        <>
                            {!hasMikrotikAccount && (
                                <button
                                    onClick={() => setStep('mikrotik')}
                                    className="px-4 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
                                >
                                    Back
                                </button>
                            )}
                            <button
                                onClick={handleClose}
                                className="px-4 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleActivate}
                                disabled={isLoading}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                                Confirm Activation
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={handleClose}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                        >
                            Close
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
