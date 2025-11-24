'use client';

import { Search, Filter, ChevronLeft, ChevronRight, MoreVertical } from 'lucide-react';

interface Column<T> {
    header: string;
    accessor: keyof T | ((item: T) => React.ReactNode);
    className?: string;
}

interface DataTableProps<T> {
    data: T[];
    columns: Column<T>[];
    title: string;
    actionLabel?: string;
    onAction?: () => void;
}

export default function DataTable<T extends { id: string }>({
    data,
    columns,
    title,
    actionLabel,
    onAction
}: DataTableProps<T>) {
    return (
        <div className="glass-card overflow-hidden">
            <div className="p-6 border-b border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-xl font-semibold text-white">{title}</h2>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search..."
                            className="bg-white/5 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                        />
                    </div>
                    <button className="p-2 bg-white/5 border border-gray-700 rounded-lg text-gray-400 hover:text-white">
                        <Filter className="w-4 h-4" />
                    </button>
                    {actionLabel && (
                        <button
                            onClick={onAction}
                            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                            {actionLabel}
                        </button>
                    )}
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                        <tr>
                            {columns.map((col, index) => (
                                <th key={index} className={`px-6 py-4 font-medium ${col.className || ''}`}>
                                    {col.header}
                                </th>
                            ))}
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {data.map((item) => (
                            <tr key={item.id} className="hover:bg-white/5 transition-colors">
                                {columns.map((col, index) => (
                                    <td key={index} className={`px-6 py-4 text-sm text-gray-300 ${col.className || ''}`}>
                                        {typeof col.accessor === 'function'
                                            ? col.accessor(item)
                                            : (item[col.accessor] as React.ReactNode)}
                                    </td>
                                ))}
                                <td className="px-6 py-4 text-right">
                                    <button className="text-gray-400 hover:text-white">
                                        <MoreVertical className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="p-4 border-t border-gray-800 flex items-center justify-between text-sm text-gray-400">
                <span>Showing 1 to {data.length} of {data.length} entries</span>
                <div className="flex items-center gap-2">
                    <button className="p-1 hover:text-white disabled:opacity-50" disabled>
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button className="p-1 hover:text-white disabled:opacity-50" disabled>
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
