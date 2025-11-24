'use client';

import { useState, useEffect } from 'react';
import { X, Search, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface CustomerLookupModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (customer: { id: string; name: string }) => void;
}

export default function CustomerLookupModal({ isOpen, onClose, onSelect }: CustomerLookupModalProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [customers, setCustomers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchCustomers();
        }
    }, [isOpen, searchQuery]);

    const fetchCustomers = async () => {
        setIsLoading(true);
        try {
            let query = supabase
                .from('customers')
                .select('id, name, mobile_number')
                .limit(20);

            if (searchQuery) {
                query = query.ilike('name', `%${searchQuery}%`);
            }

            const { data, error } = await query;

            if (error) throw error;
            setCustomers(data || []);
        } catch (error) {
            console.error('Error fetching customers:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                    <h3 className="font-semibold text-gray-900">Select Referrer</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 border-b border-gray-200">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search customers..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none text-gray-900"
                            autoFocus
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {isLoading ? (
                        <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin text-red-600" /></div>
                    ) : (
                        <div className="space-y-1">
                            {customers.map(customer => (
                                <button
                                    key={customer.id}
                                    onClick={() => onSelect(customer)}
                                    className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors flex flex-col group"
                                >
                                    <span className="font-medium text-gray-900 group-hover:text-red-600 transition-colors">{customer.name}</span>
                                    <span className="text-sm text-gray-500">{customer.mobile_number}</span>
                                </button>
                            ))}
                            {customers.length === 0 && (
                                <div className="text-center py-8 text-gray-500">No customers found</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
