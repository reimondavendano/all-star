'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    Database, Search, Plus, Save, Trash2, Edit, ChevronDown, 
    X, RefreshCw, FileJson, Building2, User, Lock, Eye, EyeOff, ShieldAlert, LogOut
} from 'lucide-react';
import clsx from 'clsx';

const TABLES = [
    'customers',
    'subscriptions',
    'invoices',
    'payments',
    'expenses',
    'mikrotik_ppp_secrets'
];

// Tables that reference subscription_id (and therefore need customer+sub context)
const SUB_LINKED_TABLES = ['invoices', 'payments', 'mikrotik_ppp_secrets'];

// Static credentials (case-sensitive)
const VALID_USERNAME = 'Ced@123';
const VALID_PASSWORD = 'DataSecrets@123';
const SESSION_KEY = 'data_manager_auth';

export default function DataManager() {
    // Auth state
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authUsername, setAuthUsername] = useState('');
    const [authPassword, setAuthPassword] = useState('');
    const [authError, setAuthError] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const [selectedTable, setSelectedTable] = useState('customers');
    const [data, setData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Lookup maps
    const [customers, setCustomers] = useState<any[]>([]);
    const [businessUnits, setBusinessUnits] = useState<any[]>([]);
    const [plans, setPlans] = useState<any[]>([]);
    // subscriptionMap: id -> { customerName, address, landmark }
    const [subMap, setSubMap] = useState<Record<string, { customerName: string; address: string; landmark: string }>>({});
    const [subList, setSubList] = useState<any[]>([]); // for dropdown
    const [customerMap, setCustomerMap] = useState<Record<string, string>>({});
    const [buMap, setBuMap] = useState<Record<string, string>>({});
    const [planMap, setPlanMap] = useState<Record<string, string>>({});

    // Filters
    const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
    const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<string>('');
    const [selectedBusinessUnitId, setSelectedBusinessUnitId] = useState<string>('');

    // Editor state
    const [isEditing, setIsEditing] = useState(false);
    const [editRecord, setEditRecord] = useState<any>(null);
    const [recordFields, setRecordFields] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    // Check session on mount
    useEffect(() => {
        const session = sessionStorage.getItem(SESSION_KEY);
        if (session === 'true') {
            setIsAuthenticated(true);
        }
    }, []);

    useEffect(() => {
        if (isAuthenticated) fetchInitialData();
    }, [isAuthenticated]);

    useEffect(() => {
        if (selectedTable) {
            setSelectedCustomerId('');
            setSelectedSubscriptionId('');
            setSelectedBusinessUnitId('');
            fetchTableData();
        }
    }, [selectedTable]);

    // Re-fetch when filters change (but not on table change since that resets filters)
    useEffect(() => {
        fetchTableData();
    }, [selectedCustomerId, selectedSubscriptionId, selectedBusinessUnitId]);

    const fetchInitialData = async () => {
        const [
            { data: cData }, 
            { data: bData },
            { data: pData },
            { data: sData }
        ] = await Promise.all([
            supabase.from('customers').select('id, name').order('name'),
            supabase.from('business_units').select('id, name').order('name'),
            supabase.from('plans').select('id, name').order('name'),
            supabase.from('subscriptions').select('id, subscriber_id, address, landmark')
        ]);
        
        if (cData) {
            setCustomers(cData);
            const cMap: Record<string, string> = {};
            cData.forEach((c: any) => { cMap[c.id] = c.name; });
            setCustomerMap(cMap);
        }
        if (bData) {
            setBusinessUnits(bData);
            const bm: Record<string, string> = {};
            bData.forEach((b: any) => { bm[b.id] = b.name; });
            setBuMap(bm);
        }
        if (pData) {
            setPlans(pData);
            const pm: Record<string, string> = {};
            pData.forEach((p: any) => { pm[p.id] = p.name; });
            setPlanMap(pm);
        }
        if (sData && cData) {
            const cMap: Record<string, string> = {};
            cData.forEach((c: any) => { cMap[c.id] = c.name; });
            
            const sm: Record<string, { customerName: string; address: string; landmark: string }> = {};
            sData.forEach((s: any) => {
                sm[s.id] = {
                    customerName: cMap[s.subscriber_id] || 'Unknown',
                    address: s.address || '',
                    landmark: s.landmark || ''
                };
            });
            setSubMap(sm);
            setSubList(sData.map((s: any) => ({
                ...s,
                customerName: cMap[s.subscriber_id] || 'Unknown'
            })));
        }
    };

    const fetchTableData = async () => {
        setIsLoading(true);
        try {
            let query = supabase.from(selectedTable).select('*');
            
            // Apply relation filters
            if (selectedTable === 'subscriptions' && selectedCustomerId) {
                query = query.eq('subscriber_id', selectedCustomerId);
            }
            if (selectedTable === 'expenses' && selectedBusinessUnitId) {
                query = query.eq('business_unit_id', selectedBusinessUnitId);
            }
            // For sub-linked tables, filter by subscription_id or by customer's subscriptions
            if (SUB_LINKED_TABLES.includes(selectedTable)) {
                if (selectedSubscriptionId) {
                    query = query.eq('subscription_id', selectedSubscriptionId);
                } else if (selectedCustomerId) {
                    // Get all subscription IDs for the selected customer
                    const customerSubIds = subList
                        .filter(s => s.subscriber_id === selectedCustomerId)
                        .map(s => s.id);
                    if (customerSubIds.length > 0) {
                        query = query.in('subscription_id', customerSubIds);
                    } else {
                        // No subscriptions for this customer, return empty
                        setData([]);
                        setIsLoading(false);
                        return;
                    }
                }
            }

            query = query.limit(200).order('id', { ascending: false });

            const { data: result, error } = await query;
            if (error) throw error;

            setData(result || []);
            
            if (result && result.length > 0) {
                setRecordFields(Object.keys(result[0]));
            }
        } catch (error: any) {
            console.error('Error fetching data:', error.message);
            alert('Failed to fetch data: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Get human-readable label for a subscription_id
    const getSubLabel = (subId: string) => {
        const info = subMap[subId];
        if (!info) return subId;
        const loc = [info.address, info.landmark].filter(Boolean).join(' - ');
        return `${info.customerName} → ${loc || 'No address'}`;
    };

    // Get human-readable customer name for a subscription_id  
    const getCustomerForSub = (subId: string) => {
        return subMap[subId]?.customerName || '';
    };

    // Enriched search: also search by resolved customer name, plan name, etc
    const filteredData = data.filter(item => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        
        // Search raw data
        const stringified = JSON.stringify(item).toLowerCase();
        if (stringified.includes(q)) return true;

        // Search enriched names
        if (item.subscription_id) {
            const info = subMap[item.subscription_id];
            if (info) {
                const enriched = `${info.customerName} ${info.address} ${info.landmark}`.toLowerCase();
                if (enriched.includes(q)) return true;
            }
        }
        if (item.subscriber_id && customerMap[item.subscriber_id]?.toLowerCase().includes(q)) return true;
        if (item.business_unit_id && buMap[item.business_unit_id]?.toLowerCase().includes(q)) return true;
        if (item.plan_id && planMap[item.plan_id]?.toLowerCase().includes(q)) return true;

        return false;
    });

    const handleEdit = (record: any) => {
        setEditRecord({ ...record });
        setIsEditing(true);
    };

    const handleAdd = () => {
        const newRecord: any = {};
        recordFields.forEach(f => newRecord[f] = '');
        
        if (selectedTable === 'subscriptions' && selectedCustomerId) {
            newRecord.subscriber_id = selectedCustomerId;
        }
        if (selectedTable === 'expenses' && selectedBusinessUnitId) {
            newRecord.business_unit_id = selectedBusinessUnitId;
        }
        if (SUB_LINKED_TABLES.includes(selectedTable) && selectedSubscriptionId) {
            newRecord.subscription_id = selectedSubscriptionId;
        }

        setEditRecord(newRecord);
        setIsEditing(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this record? This action cannot be undone.')) return;
        
        setIsLoading(true);
        try {
            const { error } = await supabase.from(selectedTable).delete().eq('id', id);
            if (error) throw error;
            fetchTableData();
        } catch (error: any) {
            alert('Error deleting record: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const payload = { ...editRecord };
            if (!payload.id) delete payload.id;

            if (editRecord.id) {
                const { error } = await supabase.from(selectedTable).update(payload).eq('id', editRecord.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from(selectedTable).insert([payload]);
                if (error) throw error;
            }
            
            setIsEditing(false);
            setEditRecord(null);
            fetchTableData();
        } catch (error: any) {
            alert('Error saving record: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    // ========== RENDER HELPERS ==========

    const renderFieldValue = (key: string, val: any) => {
        if (val === null || val === undefined) return <span className="text-gray-600 italic">null</span>;
        
        // Resolve subscription_id → Customer Name + Address (Landmark)
        if (key === 'subscription_id' && typeof val === 'string') {
            const info = subMap[val];
            if (info) {
                const loc = [info.address, info.landmark].filter(Boolean).join(' - ');
                return (
                    <div>
                        <span className="text-cyan-400 font-bold not-italic">{info.customerName}</span>
                        {loc && <div className="text-[11px] text-gray-400">{loc}</div>}
                        <div className="text-[10px] text-gray-600 font-mono mt-0.5">{val}</div>
                    </div>
                );
            }
        }
        // Resolve subscriber_id → Customer Name
        if (key === 'subscriber_id' && typeof val === 'string') {
            const name = customerMap[val];
            if (name) return <div><span className="text-emerald-400 font-bold not-italic">{name}</span><div className="text-[10px] text-gray-600 font-mono mt-0.5">{val}</div></div>;
        }
        // Resolve business_unit_id → BU Name
        if (key === 'business_unit_id' && typeof val === 'string') {
            const name = buMap[val];
            if (name) return <div><span className="text-indigo-400 font-bold not-italic">{name}</span><div className="text-[10px] text-gray-600 font-mono mt-0.5">{val}</div></div>;
        }
        // Resolve plan_id → Plan Name
        if (key === 'plan_id' && typeof val === 'string') {
            const name = planMap[val];
            if (name) return <div><span className="text-pink-400 font-bold not-italic">{name}</span><div className="text-[10px] text-gray-600 font-mono mt-0.5">{val}</div></div>;
        }

        if (typeof val === 'boolean') return <span className={val ? "text-emerald-400" : "text-red-400"}>{val.toString()}</span>;
        if (typeof val === 'object') return <span className="text-purple-400">{JSON.stringify(val)}</span>;
        return <span className="text-gray-300">{val.toString()}</span>;
    };

    const renderInputForField = (field: string) => {
        if (field === 'id') {
            return (
                <input type="text" value={editRecord[field] || ''} disabled className="w-full bg-[#0a0a0a] border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-500 font-mono cursor-not-allowed" />
            );
        }
        
        if (field === 'subscription_id') {
            return (
                <div className="relative">
                    <select 
                        value={editRecord[field] || ''}
                        onChange={(e) => setEditRecord({ ...editRecord, [field]: e.target.value })}
                        className="w-full bg-[#0a0a0a] border border-gray-800 focus:border-red-500 rounded-lg px-3 py-2 text-sm text-white appearance-none"
                    >
                        <option value="">-- Select Customer & Subscription --</option>
                        {subList.map(s => {
                            const loc = [s.address, s.landmark].filter(Boolean).join(' - ');
                            return (
                                <option key={s.id} value={s.id}>
                                    {s.customerName} → {loc || 'No address'}
                                </option>
                            );
                        })}
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                </div>
            );
        }
        
        if (field === 'business_unit_id') {
            return (
                <div className="relative">
                    <select 
                        value={editRecord[field] || ''}
                        onChange={(e) => setEditRecord({ ...editRecord, [field]: e.target.value })}
                        className="w-full bg-[#0a0a0a] border border-gray-800 focus:border-red-500 rounded-lg px-3 py-2 text-sm text-white appearance-none"
                    >
                        <option value="">-- Select Business Unit --</option>
                        {businessUnits.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                </div>
            );
        }
    
        if (field === 'plan_id') {
            return (
                <div className="relative">
                    <select 
                        value={editRecord[field] || ''}
                        onChange={(e) => setEditRecord({ ...editRecord, [field]: e.target.value })}
                        className="w-full bg-[#0a0a0a] border border-gray-800 focus:border-red-500 rounded-lg px-3 py-2 text-sm text-white appearance-none"
                    >
                        <option value="">-- Select Plan --</option>
                        {plans.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                </div>
            );
        }
    
        if (field === 'subscriber_id') {
            return (
                <div className="relative">
                    <select 
                        value={editRecord[field] || ''}
                        onChange={(e) => setEditRecord({ ...editRecord, [field]: e.target.value })}
                        className="w-full bg-[#0a0a0a] border border-gray-800 focus:border-red-500 rounded-lg px-3 py-2 text-sm text-white appearance-none"
                    >
                        <option value="">-- Select Customer --</option>
                        {customers.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                </div>
            );
        }
    
        // Default text input
        return (
            <input
                type="text"
                value={editRecord[field] === null ? '' : (typeof editRecord[field] === 'object' ? JSON.stringify(editRecord[field]) : editRecord[field])}
                onChange={(e) => setEditRecord({ ...editRecord, [field]: e.target.value === '' ? null : e.target.value })}
                className="w-full bg-[#0a0a0a] border border-gray-800 focus:border-red-500 rounded-lg px-3 py-2 text-sm text-white font-mono"
            />
        );
    };

    // Get the card header info for sub-linked tables
    const getCardHeader = (item: any) => {
        if (SUB_LINKED_TABLES.includes(selectedTable) && item.subscription_id) {
            const info = subMap[item.subscription_id];
            if (info) {
                const loc = [info.address, info.landmark].filter(Boolean).join(' - ');
                return (
                    <div className="mb-2">
                        <div className="text-sm font-bold text-cyan-400 flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5" />
                            {info.customerName}
                        </div>
                        {loc && <div className="text-[11px] text-gray-500 ml-5">{loc}</div>}
                    </div>
                );
            }
        }
        return null;
    };

    // Filter subscriptions based on selected customer for the filter dropdown
    const filteredSubList = selectedCustomerId 
        ? subList.filter(s => s.subscriber_id === selectedCustomerId) 
        : subList;

    // ========== AUTH HANDLERS ==========

    const handleLogin = () => {
        setAuthError('');
        if (authUsername === VALID_USERNAME && authPassword === VALID_PASSWORD) {
            setIsAuthenticated(true);
            sessionStorage.setItem(SESSION_KEY, 'true');
            setAuthUsername('');
            setAuthPassword('');
        } else {
            setAuthError('Invalid credentials. Username and password are case-sensitive.');
        }
    };

    const handleLogout = () => {
        setIsAuthenticated(false);
        sessionStorage.removeItem(SESSION_KEY);
    };

    // ========== RENDER ==========

    // Auth Gate
    if (!isAuthenticated) {
        return (
            <div className="flex items-center justify-center min-h-[70vh]">
                <div className="w-full max-w-md">
                    <div className="glass-card border border-red-900/50 shadow-[0_0_60px_rgba(255,0,0,0.1)] overflow-hidden">
                        {/* Header */}
                        <div className="relative p-8 text-center border-b border-red-900/30">
                            <div className="absolute inset-0 bg-gradient-to-br from-red-900/10 via-transparent to-red-900/5" />
                            <div className="relative">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center shadow-[0_0_30px_rgba(255,0,0,0.4)]">
                                    <Lock className="w-8 h-8 text-white" />
                                </div>
                                <h2 className="text-xl font-bold text-white">Data Manager Access</h2>
                                <p className="text-gray-400 text-sm mt-1">Enter credentials to continue</p>
                            </div>
                        </div>

                        {/* Form */}
                        <div className="p-8 space-y-5">
                            {authError && (
                                <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-red-300 text-sm">
                                    <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                                    {authError}
                                </div>
                            )}

                            <div>
                                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Username</label>
                                <input
                                    type="text"
                                    value={authUsername}
                                    onChange={(e) => { setAuthUsername(e.target.value); setAuthError(''); }}
                                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                                    placeholder="Enter username"
                                    className="w-full bg-[#0a0a0a] border border-gray-800 focus:border-red-500 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-red-500/50 transition-all"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Password</label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={authPassword}
                                        onChange={(e) => { setAuthPassword(e.target.value); setAuthError(''); }}
                                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                                        placeholder="Enter password"
                                        className="w-full bg-[#0a0a0a] border border-gray-800 focus:border-red-500 rounded-lg px-4 py-3 pr-12 text-white focus:outline-none focus:ring-1 focus:ring-red-500/50 transition-all"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors p-1"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={handleLogin}
                                className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white py-3 rounded-lg font-medium transition-all shadow-[0_0_20px_rgba(220,38,38,0.4)] hover:shadow-[0_0_30px_rgba(220,38,38,0.6)] flex items-center justify-center gap-2"
                            >
                                <Lock className="w-4 h-4" />
                                Unlock Data Manager
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20">
            <div className="glass-card p-6 border-b border-red-900/30">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-red-900/20 rounded-xl shadow-[0_0_15px_rgba(255,0,0,0.2)]">
                            <Database className="w-6 h-6 text-red-500" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white tracking-wide">Data Job Manager</h1>
                            <p className="text-gray-400 text-sm">Direct database access and manipulation</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white bg-gray-800/50 hover:bg-red-900/30 border border-gray-700 hover:border-red-700/50 rounded-lg transition-all"
                        title="Lock Data Manager"
                    >
                        <LogOut className="w-4 h-4" />
                        <span className="hidden sm:inline">Lock</span>
                    </button>
                </div>

                <div className="flex flex-wrap items-end gap-4">
                    {/* Table Selector */}
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Select Table</label>
                        <div className="relative">
                            <select 
                                value={selectedTable}
                                onChange={(e) => {
                                    setSelectedTable(e.target.value);
                                    setSearchQuery('');
                                }}
                                className="w-full bg-[#0a0a0a] border border-red-900/30 text-white rounded-lg px-4 py-2.5 appearance-none focus:outline-none focus:border-red-500 transition-colors"
                            >
                                {TABLES.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                            <ChevronDown className="w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                        </div>
                    </div>

                    {/* Customer filter for subscriptions table */}
                    {selectedTable === 'subscriptions' && (
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                <User className="w-3 h-3" /> Filter by Customer
                            </label>
                            <div className="relative flex items-center gap-1">
                                <div className="relative flex-1">
                                    <select 
                                        value={selectedCustomerId}
                                        onChange={(e) => setSelectedCustomerId(e.target.value)}
                                        className="w-full bg-[#0a0a0a] border border-red-900/30 text-white rounded-lg px-4 py-2.5 pr-8 appearance-none focus:outline-none focus:border-red-500 transition-colors"
                                    >
                                        <option value="">-- All Customers --</option>
                                        {customers.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                                </div>
                                {selectedCustomerId && (
                                    <button onClick={() => setSelectedCustomerId('')} className="p-2 text-gray-400 hover:text-white hover:bg-red-900/30 rounded-lg transition-colors" title="Clear filter">
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Customer + Subscription filters for invoices, payments, mikrotik_ppp_secrets */}
                    {SUB_LINKED_TABLES.includes(selectedTable) && (
                        <>
                            <div className="flex-1 min-w-[200px]">
                                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                    <User className="w-3 h-3" /> Filter by Customer
                                </label>
                                <div className="relative flex items-center gap-1">
                                    <div className="relative flex-1">
                                        <select 
                                            value={selectedCustomerId}
                                            onChange={(e) => {
                                                setSelectedCustomerId(e.target.value);
                                                setSelectedSubscriptionId('');
                                            }}
                                            className="w-full bg-[#0a0a0a] border border-red-900/30 text-white rounded-lg px-4 py-2.5 pr-8 appearance-none focus:outline-none focus:border-red-500 transition-colors"
                                        >
                                            <option value="">-- All Customers --</option>
                                            {customers.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                                    </div>
                                    {selectedCustomerId && (
                                        <button onClick={() => { setSelectedCustomerId(''); setSelectedSubscriptionId(''); }} className="p-2 text-gray-400 hover:text-white hover:bg-red-900/30 rounded-lg transition-colors" title="Clear filter">
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="flex-1 min-w-[250px]">
                                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                    📍 Filter by Subscription
                                </label>
                                <div className="relative flex items-center gap-1">
                                    <div className="relative flex-1">
                                        <select 
                                            value={selectedSubscriptionId}
                                            onChange={(e) => setSelectedSubscriptionId(e.target.value)}
                                            className="w-full bg-[#0a0a0a] border border-red-900/30 text-white rounded-lg px-4 py-2.5 pr-8 appearance-none focus:outline-none focus:border-red-500 transition-colors"
                                        >
                                            <option value="">-- All Subscriptions --</option>
                                            {filteredSubList.map(s => {
                                                const loc = [s.address, s.landmark].filter(Boolean).join(' - ');
                                                return (
                                                    <option key={s.id} value={s.id}>
                                                        {s.customerName} → {loc || 'No address'}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                                    </div>
                                    {selectedSubscriptionId && (
                                        <button onClick={() => setSelectedSubscriptionId('')} className="p-2 text-gray-400 hover:text-white hover:bg-red-900/30 rounded-lg transition-colors" title="Clear filter">
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Business Unit filter for expenses */}
                    {selectedTable === 'expenses' && (
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                <Building2 className="w-3 h-3" /> Select Business Unit
                            </label>
                            <div className="relative flex items-center gap-1">
                                <div className="relative flex-1">
                                    <select 
                                        value={selectedBusinessUnitId}
                                        onChange={(e) => setSelectedBusinessUnitId(e.target.value)}
                                        className="w-full bg-[#0a0a0a] border border-red-900/30 text-white rounded-lg px-4 py-2.5 pr-8 appearance-none focus:outline-none focus:border-red-500 transition-colors"
                                    >
                                        <option value="">-- All Units --</option>
                                        {businessUnits.map(b => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                                </div>
                                {selectedBusinessUnitId && (
                                    <button onClick={() => setSelectedBusinessUnitId('')} className="p-2 text-gray-400 hover:text-white hover:bg-red-900/30 rounded-lg transition-colors" title="Clear filter">
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Search */}
                    <div className="flex-1 min-w-[250px]">
                        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Search Records</label>
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Search by name, address, etc..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-[#0a0a0a] border border-red-900/30 rounded-lg pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-red-500 transition-colors"
                            />
                        </div>
                    </div>

                    <button 
                        onClick={handleAdd}
                        className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 font-medium transition-colors shadow-[0_0_15px_rgba(220,38,38,0.4)]"
                    >
                        <Plus className="w-4 h-4" /> Add Record
                    </button>

                    <button 
                        onClick={fetchTableData}
                        className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2.5 rounded-lg flex items-center transition-colors border border-gray-700"
                    >
                        <RefreshCw className={clsx("w-4 h-4", isLoading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Editing Form */}
            {isEditing && editRecord && (
                <div className="glass-card border border-red-500/50 shadow-[0_0_30px_rgba(255,0,0,0.1)] overflow-hidden">
                    <div className="bg-red-900/20 p-4 border-b border-red-900/30 flex justify-between items-center">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <FileJson className="w-5 h-5 text-red-400" />
                            {editRecord.id ? `Edit ${selectedTable} Record` : `New ${selectedTable} Record`}
                        </h2>
                        <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-white p-1 rounded-md hover:bg-white/10">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    
                    <div className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {recordFields.map(field => (
                                <div key={field} className="space-y-1">
                                    <label className="block text-xs font-mono text-red-300 uppercase truncate">
                                        {field}
                                        {field === 'id' && <span className="ml-2 text-[10px] text-gray-500">(Auto if blank)</span>}
                                    </label>
                                    {renderInputForField(field)}
                                </div>
                            ))}
                        </div>

                        {/* Add new field dynamically */}
                        <div className="mt-8 pt-6 border-t border-gray-800">
                            <h3 className="text-xs text-gray-500 uppercase mb-3">Add Custom Field</h3>
                            <div className="flex items-center gap-3">
                                <input 
                                    type="text" 
                                    id="newFieldName" 
                                    placeholder="field_name" 
                                    className="bg-[#0a0a0a] border border-gray-800 rounded-lg px-3 py-2 text-sm text-white font-mono"
                                />
                                <button 
                                    onClick={() => {
                                        const el = document.getElementById('newFieldName') as HTMLInputElement;
                                        if (el.value && !recordFields.includes(el.value)) {
                                            setRecordFields([...recordFields, el.value]);
                                            setEditRecord({ ...editRecord, [el.value]: '' });
                                            el.value = '';
                                        }
                                    }}
                                    className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm"
                                >
                                    Add Field
                                </button>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-3">
                            <button 
                                onClick={() => setIsEditing(false)}
                                className="px-5 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSave}
                                disabled={isSaving}
                                className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg flex items-center gap-2 font-medium disabled:opacity-50 transition-colors shadow-[0_0_15px_rgba(220,38,38,0.4)]"
                            >
                                {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Save Record
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Data View */}
            {isLoading ? (
                <div className="glass-card p-12 text-center text-gray-500">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                    Loading...
                </div>
            ) : filteredData.length === 0 ? (
                <div className="glass-card p-12 text-center text-gray-500">
                    <Database className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>No records found in {selectedTable}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {filteredData.map((item, idx) => (
                        <div key={item.id || idx} className="glass-card p-5 hover:border-red-900/50 transition-colors flex flex-col">
                            {/* Card header: Customer name for sub-linked tables */}
                            {getCardHeader(item)}

                            <div className="flex justify-between items-start mb-4 pb-3 border-b border-gray-800/50">
                                <div className="text-sm font-mono text-red-400 truncate max-w-[80%]">ID: {item.id || 'N/A'}</div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => handleEdit(item)}
                                        className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded"
                                    >
                                        <Edit className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(item.id)}
                                        className="p-1.5 text-red-500 hover:text-red-400 hover:bg-red-900/30 rounded"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            
                            <div className="flex-1 overflow-x-auto">
                                <table className="w-full text-sm">
                                    <tbody className="divide-y divide-gray-800/50">
                                        {Object.entries(item).filter(([k]) => k !== 'id').map(([key, value]) => (
                                            <tr key={key} className="hover:bg-white/5">
                                                <td className="py-2 pr-4 text-gray-500 font-mono text-xs w-1/3 align-top">{key}</td>
                                                <td className="py-2 break-all font-mono text-xs">{renderFieldValue(key, value)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
