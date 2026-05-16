'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Send, Users, AlertCircle, Loader2, CheckCircle, Info } from 'lucide-react';
import ConfirmationDialog from '@/components/shared/ConfirmationDialog';

export default function AnnouncementsPage() {
    const [businessUnits, setBusinessUnits] = useState<{ id: string; name: string }[]>([]);
    const [selectedBu, setSelectedBu] = useState<string>('');
    const [message, setMessage] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    
    // Status state
    const [status, setStatus] = useState<{ type: 'success' | 'error' | null; text: string }>({ type: null, text: '' });
    const [stats, setStats] = useState<{ targeted: number; sent: number; failed: number } | null>(null);

    // Subscriber count estimation
    const [estimatedSubscribers, setEstimatedSubscribers] = useState<number | null>(null);
    const [isCounting, setIsCounting] = useState(false);

    useEffect(() => {
        const fetchBusinessUnits = async () => {
            const { data, error } = await supabase.from('business_units').select('id, name').order('name');
            if (data && !error) {
                setBusinessUnits(data);
                if (data.length > 0) {
                    setSelectedBu('all'); // Default to all or first
                }
            }
        };
        fetchBusinessUnits();
    }, []);

    // Effect to estimate subscribers when BU changes
    useEffect(() => {
        const estimateCount = async () => {
            if (!selectedBu) return;
            setIsCounting(true);
            try {
                let query = supabase.from('subscriptions').select('subscriber_id', { count: 'exact' }).eq('active', true);
                if (selectedBu !== 'all') {
                    query = query.eq('business_unit_id', selectedBu);
                }
                const { data, error } = await query;
                
                if (!error && data) {
                    // Unique subscribers
                    const uniqueIds = new Set(data.map(d => d.subscriber_id));
                    setEstimatedSubscribers(uniqueIds.size);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setIsCounting(false);
            }
        };

        estimateCount();
    }, [selectedBu]);

    const handleSendClick = () => {
        if (!message.trim()) {
            setStatus({ type: 'error', text: 'Please enter a message to send.' });
            return;
        }
        if (estimatedSubscribers === 0) {
            setStatus({ type: 'error', text: 'No active subscribers found for the selected Business Unit.' });
            return;
        }
        setStatus({ type: null, text: '' });
        setStats(null);
        setIsConfirmOpen(true);
    };

    const handleConfirmSend = async () => {
        setIsConfirmOpen(false);
        setIsLoading(true);
        setStatus({ type: null, text: '' });
        
        try {
            const res = await fetch('/api/admin/sms/announcements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    businessUnitId: selectedBu,
                    message: message.trim()
                })
            });
            
            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.error || 'Failed to send bulk SMS');
            }
            
            setStatus({ type: 'success', text: 'Bulk SMS campaign completed successfully!' });
            setStats({
                targeted: data.stats?.totalTargeted || 0,
                sent: data.stats?.sent || 0,
                failed: data.stats?.failed || 0
            });
            setMessage(''); // Clear message on success
            
        } catch (error: any) {
            setStatus({ type: 'error', text: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-xl bg-purple-900/30 flex items-center justify-center border border-purple-500/30">
                    <Send className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Announcements</h1>
                    <p className="text-sm text-gray-400">Send bulk SMS messages to active subscribers</p>
                </div>
            </div>

            <div className="glass-card p-6 md:p-8 space-y-6 relative overflow-hidden">
                {/* Decorative background element */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-purple-900/10 rounded-full blur-3xl pointer-events-none -mr-32 -mt-32" />

                <div className="space-y-4">
                    <label className="block text-sm font-medium text-gray-300">Target Audience (Business Unit)</label>
                    <div className="relative">
                        <select
                            value={selectedBu}
                            onChange={(e) => setSelectedBu(e.target.value)}
                            className="w-full bg-black/40 border border-gray-800 text-white rounded-xl px-4 py-3 appearance-none focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                        >
                            <option value="all">🌐 All Business Units (Everyone)</option>
                            {businessUnits.map(bu => (
                                <option key={bu.id} value={bu.id}>📍 {bu.name}</option>
                            ))}
                        </select>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-gray-400 bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                        <Users className="w-4 h-4 text-purple-400" />
                        <span>
                            Estimated Reach: {' '}
                            {isCounting ? (
                                <span className="animate-pulse">calculating...</span>
                            ) : (
                                <span className="font-bold text-white">{estimatedSubscribers !== null ? estimatedSubscribers : 0}</span>
                            )} 
                            {' '}active subscribers
                        </span>
                    </div>
                </div>

                <div className="space-y-4 pt-4">
                    <label className="block text-sm font-medium text-gray-300">Message Content</label>
                    <div className="relative">
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Type your announcement here (e.g., Happy Holidays, Scheduled Maintenance...)"
                            className="w-full h-40 bg-black/40 border border-gray-800 text-white rounded-xl px-4 py-3 resize-none focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                        />
                        <div className={`absolute bottom-3 right-3 text-xs ${message.length > 160 ? 'text-yellow-500' : 'text-gray-500'}`}>
                            {message.length} chars {message.length > 160 && '(Will use multiple credits per person)'}
                        </div>
                    </div>
                    
                    <div className="flex items-start gap-2 text-sm text-gray-400 bg-blue-900/10 p-3 rounded-lg border border-blue-900/30">
                        <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                        <p>
                            Messages are sent using your Semaphore credits. Ensure you have enough balance before sending to large groups.
                        </p>
                    </div>
                </div>

                {status.type && (
                    <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                        status.type === 'success' 
                            ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-400' 
                            : 'bg-red-900/20 border-red-500/30 text-red-400'
                    }`}>
                        {status.type === 'success' ? <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" /> : <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />}
                        <div>
                            <p className="font-medium">{status.text}</p>
                            {stats && (
                                <ul className="mt-2 text-sm space-y-1 opacity-90">
                                    <li>• Total Targeted: {stats.targeted}</li>
                                    <li>• Successfully Queued/Sent: {stats.sent}</li>
                                    {stats.failed > 0 && <li className="text-red-300">• Failed: {stats.failed}</li>}
                                </ul>
                            )}
                        </div>
                    </div>
                )}

                <div className="pt-6 border-t border-gray-800 flex justify-end">
                    <button
                        onClick={handleSendClick}
                        disabled={isLoading || !message.trim() || estimatedSubscribers === 0}
                        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-purple-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Sending Bulk SMS...
                            </>
                        ) : (
                            <>
                                <Send className="w-5 h-5" />
                                Send to {estimatedSubscribers || 0} Subscribers
                            </>
                        )}
                    </button>
                </div>
            </div>

            <ConfirmationDialog
                isOpen={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                onConfirm={handleConfirmSend}
                title="Send Bulk Announcement"
                message={`Are you sure you want to send this message to ~${estimatedSubscribers} active subscribers? This action cannot be undone and will consume SMS credits.`}
                confirmText="Yes, Send Now"
                type="warning"
            />
        </div>
    );
}
