'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
    FileText,
    MessageSquare,
    Calendar,
    Building2,
    RefreshCw,
    CheckCircle,
    XCircle,
    Clock,
    ChevronRight,
    ChevronDown,
    Users,
    AlertTriangle,
    Zap
} from 'lucide-react';

interface InvoiceLog {
    id: string;
    business_unit_id: string;
    billing_year: number;
    billing_month: number;
    invoices_generated: number;
    invoices_skipped: number;
    sms_sent: number;
    triggered_by: string;
    errors: any;
    created_at: string;
    business_units?: {
        name: string;
    };
}

interface SMSLog {
    id: string;
    customer_id: string;
    phone_number: string;
    message_type: string;
    message_content: string;
    status: string;
    external_message_id?: string;
    error_message?: string;
    created_at: string;
    customers?: {
        name: string;
    };
}

export default function BillingPage() {
    const [activeTab, setActiveTab] = useState<'generation' | 'sms' | 'manual'>('generation');
    const [isLoading, setIsLoading] = useState(true);
    const [invoiceLogs, setInvoiceLogs] = useState<InvoiceLog[]>([]);
    const [smsLogs, setSmsLogs] = useState<SMSLog[]>([]);
    const [businessUnits, setBusinessUnits] = useState<{ id: string; name: string }[]>([]);

    // Manual generation state
    const [selectedBusinessUnit, setSelectedBusinessUnit] = useState<string>('');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [sendSmsOnGenerate, setSendSmsOnGenerate] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationResult, setGenerationResult] = useState<any>(null);

    useEffect(() => {
        fetchBusinessUnits();
        fetchInvoiceLogs();
        fetchSmsLogs();
    }, []);

    const fetchBusinessUnits = async () => {
        const { data } = await supabase
            .from('business_units')
            .select('id, name')
            .order('name');
        setBusinessUnits(data || []);
        if (data && data.length > 0) {
            setSelectedBusinessUnit(data[0].id);
        }
    };

    const fetchInvoiceLogs = async () => {
        try {
            const { data, error } = await supabase
                .from('invoice_generation_log')
                .select(`
                    *,
                    business_units (name)
                `)
                .order('created_at', { ascending: false })
                .limit(50);

            if (!error) {
                setInvoiceLogs(data || []);
            }
        } catch (e) {
            console.log('Invoice logs table may not exist yet');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchSmsLogs = async () => {
        try {
            const { data, error } = await supabase
                .from('sms_log')
                .select(`
                    *,
                    customers (name)
                `)
                .order('created_at', { ascending: false })
                .limit(100);

            if (!error) {
                setSmsLogs(data || []);
            }
        } catch (e) {
            console.log('SMS logs table may not exist yet');
        }
    };

    const handleManualGeneration = async () => {
        if (!selectedBusinessUnit) {
            alert('Please select a business unit');
            return;
        }

        setIsGenerating(true);
        setGenerationResult(null);

        try {
            const response = await fetch('/api/cron', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'generate_invoices',
                    businessUnitId: selectedBusinessUnit,
                    year: selectedYear,
                    month: selectedMonth,
                    sendSms: sendSmsOnGenerate,
                }),
            });

            const result = await response.json();
            setGenerationResult(result);

            // Refresh logs
            fetchInvoiceLogs();
            fetchSmsLogs();

        } catch (error) {
            setGenerationResult({
                success: false,
                error: 'Failed to trigger generation. Check console for details.',
            });
            console.error('Generation error:', error);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSendReminders = async () => {
        if (!selectedBusinessUnit) return;

        setIsGenerating(true);
        try {
            const response = await fetch('/api/cron', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'send_due_reminders',
                    businessUnitId: selectedBusinessUnit,
                }),
            });

            const result = await response.json();
            setGenerationResult(result);
            fetchSmsLogs();
        } catch (error) {
            console.error('Error sending reminders:', error);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSendWarnings = async () => {
        if (!selectedBusinessUnit) return;

        setIsGenerating(true);
        try {
            const response = await fetch('/api/cron', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'send_disconnection_warnings',
                    businessUnitId: selectedBusinessUnit,
                }),
            });

            const result = await response.json();
            setGenerationResult(result);
            fetchSmsLogs();
        } catch (error) {
            console.error('Error sending warnings:', error);
        } finally {
            setIsGenerating(false);
        }
    };

    const getMonthName = (month: number) => {
        return new Date(2025, month - 1, 1).toLocaleDateString('en-US', { month: 'long' });
    };

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 3 }, (_, i) => currentYear - 1 + i);
    const months = Array.from({ length: 12 }, (_, i) => i + 1);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="glass-card p-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Billing Management</h1>
                        <p className="text-sm text-gray-400 mt-1">
                            View invoice generation history, SMS logs, and trigger manual operations
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            fetchInvoiceLogs();
                            fetchSmsLogs();
                        }}
                        className="px-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white hover:bg-[#252525] transition-colors flex items-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-800">
                <button
                    onClick={() => setActiveTab('generation')}
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'generation'
                            ? 'text-blue-500 border-blue-500'
                            : 'text-gray-400 border-transparent hover:text-white'
                        }`}
                >
                    <FileText className="w-4 h-4 inline mr-2" />
                    Invoice Generation
                </button>
                <button
                    onClick={() => setActiveTab('sms')}
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'sms'
                            ? 'text-blue-500 border-blue-500'
                            : 'text-gray-400 border-transparent hover:text-white'
                        }`}
                >
                    <MessageSquare className="w-4 h-4 inline mr-2" />
                    SMS Logs
                </button>
                <button
                    onClick={() => setActiveTab('manual')}
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'manual'
                            ? 'text-blue-500 border-blue-500'
                            : 'text-gray-400 border-transparent hover:text-white'
                        }`}
                >
                    <Zap className="w-4 h-4 inline mr-2" />
                    Manual Trigger
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'generation' && (
                <div className="glass-card overflow-hidden">
                    <div className="p-4 border-b border-gray-800">
                        <h2 className="text-lg font-semibold text-white">Invoice Generation History</h2>
                    </div>
                    <div className="divide-y divide-gray-800">
                        {isLoading ? (
                            <div className="p-8 text-center text-gray-500">Loading...</div>
                        ) : invoiceLogs.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">
                                No invoice generation logs found. Run the database migration to enable logging.
                            </div>
                        ) : (
                            invoiceLogs.map((log) => (
                                <div key={log.id} className="p-4 hover:bg-[#1a1a1a] transition-colors">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <Building2 className="w-4 h-4 text-blue-500" />
                                                <span className="text-white font-medium">
                                                    {log.business_units?.name || 'Unknown'}
                                                </span>
                                                <span className="text-gray-500">•</span>
                                                <span className="text-gray-400">
                                                    {getMonthName(log.billing_month)} {log.billing_year}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4 mt-2 text-sm">
                                                <span className="flex items-center gap-1 text-green-400">
                                                    <CheckCircle className="w-3 h-3" />
                                                    {log.invoices_generated} generated
                                                </span>
                                                <span className="flex items-center gap-1 text-gray-400">
                                                    <Clock className="w-3 h-3" />
                                                    {log.invoices_skipped} skipped
                                                </span>
                                                <span className="flex items-center gap-1 text-blue-400">
                                                    <MessageSquare className="w-3 h-3" />
                                                    {log.sms_sent} SMS sent
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs text-gray-500">
                                                {new Date(log.created_at).toLocaleDateString()} {new Date(log.created_at).toLocaleTimeString()}
                                            </div>
                                            <div className="text-xs text-gray-600 mt-1">
                                                Triggered by: {log.triggered_by || 'unknown'}
                                            </div>
                                        </div>
                                    </div>
                                    {log.errors && Object.keys(log.errors).length > 0 && (
                                        <div className="mt-2 p-2 bg-red-900/20 border border-red-700/50 rounded text-xs text-red-400">
                                            {JSON.stringify(log.errors)}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'sms' && (
                <div className="glass-card overflow-hidden">
                    <div className="p-4 border-b border-gray-800">
                        <h2 className="text-lg font-semibold text-white">SMS Notification Logs</h2>
                    </div>
                    <div className="divide-y divide-gray-800">
                        {smsLogs.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">
                                No SMS logs found. Run the database migration to enable SMS logging.
                            </div>
                        ) : (
                            smsLogs.map((log) => (
                                <div key={log.id} className="p-4 hover:bg-[#1a1a1a] transition-colors">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                {log.status === 'sent' ? (
                                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                                ) : log.status === 'failed' ? (
                                                    <XCircle className="w-4 h-4 text-red-500" />
                                                ) : (
                                                    <Clock className="w-4 h-4 text-yellow-500" />
                                                )}
                                                <span className="text-white font-medium">
                                                    {log.customers?.name || log.phone_number}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded text-xs ${log.message_type === 'invoice' ? 'bg-blue-900/30 text-blue-400' :
                                                        log.message_type === 'reminder' ? 'bg-yellow-900/30 text-yellow-400' :
                                                            log.message_type === 'warning' ? 'bg-red-900/30 text-red-400' :
                                                                log.message_type === 'payment' ? 'bg-green-900/30 text-green-400' :
                                                                    'bg-gray-800 text-gray-400'
                                                    }`}>
                                                    {log.message_type}
                                                </span>
                                            </div>
                                            <div className="mt-1 text-sm text-gray-400 truncate max-w-lg">
                                                {log.message_content.substring(0, 100)}...
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className={`text-xs ${log.status === 'sent' ? 'text-green-500' :
                                                    log.status === 'failed' ? 'text-red-500' :
                                                        'text-yellow-500'
                                                }`}>
                                                {log.status}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1">
                                                {new Date(log.created_at).toLocaleDateString()} {new Date(log.created_at).toLocaleTimeString()}
                                            </div>
                                        </div>
                                    </div>
                                    {log.error_message && (
                                        <div className="mt-2 p-2 bg-red-900/20 border border-red-700/50 rounded text-xs text-red-400">
                                            {log.error_message}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'manual' && (
                <div className="glass-card p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Manual Billing Operations</h2>

                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Business Unit</label>
                            <select
                                value={selectedBusinessUnit}
                                onChange={(e) => setSelectedBusinessUnit(e.target.value)}
                                className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-4 py-2 text-white"
                            >
                                {businessUnits.map(bu => (
                                    <option key={bu.id} value={bu.id}>{bu.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Month</label>
                            <select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                                className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-4 py-2 text-white"
                            >
                                {months.map(m => (
                                    <option key={m} value={m}>{getMonthName(m)}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Year</label>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                                className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-4 py-2 text-white"
                            >
                                {years.map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 mb-6">
                        <input
                            type="checkbox"
                            id="sendSmsManual"
                            checked={sendSmsOnGenerate}
                            onChange={(e) => setSendSmsOnGenerate(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-500"
                        />
                        <label htmlFor="sendSmsManual" className="text-sm text-gray-400">
                            Send SMS notifications
                        </label>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <button
                            onClick={handleManualGeneration}
                            disabled={isGenerating}
                            className="px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            {isGenerating ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                                <FileText className="w-4 h-4" />
                            )}
                            Generate Invoices
                        </button>
                        <button
                            onClick={handleSendReminders}
                            disabled={isGenerating}
                            className="px-4 py-3 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            <Clock className="w-4 h-4" />
                            Send Due Reminders
                        </button>
                        <button
                            onClick={handleSendWarnings}
                            disabled={isGenerating}
                            className="px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            <AlertTriangle className="w-4 h-4" />
                            Send Disconnection Warnings
                        </button>
                    </div>

                    {generationResult && (
                        <div className={`mt-6 p-4 rounded-lg border ${generationResult.success
                                ? 'bg-green-900/20 border-green-700/50 text-green-400'
                                : 'bg-red-900/20 border-red-700/50 text-red-400'
                            }`}>
                            <div className="flex items-center gap-2 mb-2">
                                {generationResult.success ? (
                                    <CheckCircle className="w-5 h-5" />
                                ) : (
                                    <XCircle className="w-5 h-5" />
                                )}
                                <span className="font-medium">
                                    {generationResult.success ? 'Operation Successful' : 'Operation Failed'}
                                </span>
                            </div>
                            <pre className="text-xs overflow-auto max-h-40">
                                {JSON.stringify(generationResult, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
