'use client';

import { CreditCard, Calendar, Wifi, AlertCircle } from 'lucide-react';

export default function CustomerDashboard() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white neon-text">My Dashboard</h1>
                    <p className="text-xs text-gray-500 font-mono mt-1">SUBSCRIBER ID: #8829-XJ</p>
                </div>
                <span className="px-3 py-1 rounded border border-green-500/30 bg-green-900/10 text-green-400 text-sm font-mono flex items-center">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                    ACTIVE SERVICE
                </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="tech-card p-6 rounded-xl group hover:border-red-500/50 transition-colors">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-gray-400 text-xs font-mono uppercase">Current Plan</h3>
                        <Wifi className="w-5 h-5 text-red-500 group-hover:animate-pulse" />
                    </div>
                    <p className="text-2xl font-bold text-white neon-text">Fiber Pro 100Mbps</p>
                    <p className="text-sm text-gray-500 mt-1 font-mono">₱2,500 / month</p>
                </div>

                <div className="tech-card p-6 rounded-xl group hover:border-red-500/50 transition-colors">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-gray-400 text-xs font-mono uppercase">Current Balance</h3>
                        <CreditCard className="w-5 h-5 text-red-500 group-hover:animate-pulse" />
                    </div>
                    <p className="text-2xl font-bold text-white neon-text">₱2,500.00</p>
                    <p className="text-sm text-red-500 mt-1 font-mono">Due on Mar 20, 2024</p>
                </div>

                <div className="tech-card p-6 rounded-xl group hover:border-red-500/50 transition-colors">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-gray-400 text-xs font-mono uppercase">Next Billing</h3>
                        <Calendar className="w-5 h-5 text-red-500 group-hover:animate-pulse" />
                    </div>
                    <p className="text-2xl font-bold text-white neon-text">Apr 15, 2024</p>
                    <p className="text-sm text-gray-500 mt-1 font-mono">Billing Cycle: 15th</p>
                </div>
            </div>

            <div className="tech-card p-6 rounded-xl">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-white flex items-center">
                        <AlertCircle className="w-4 h-4 mr-2 text-red-500" />
                        Recent Invoices
                    </h3>
                    <span className="text-xs text-gray-500 font-mono">HISTORY</span>
                </div>
                <div className="space-y-4">
                    {[1, 2].map((i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-black/40 border border-gray-800 rounded-lg hover:border-red-500/30 transition-colors group">
                            <div className="flex items-center">
                                <div className="p-2 bg-red-900/10 rounded-lg mr-4 border border-red-900/20 group-hover:border-red-500/50">
                                    <CreditCard className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
                                </div>
                                <div>
                                    <p className="text-white font-medium font-mono text-sm">Invoice #INV-00{i}</p>
                                    <p className="text-xs text-gray-500">Mar 15, 2024</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-white font-medium font-mono">₱2,500.00</p>
                                <span className={`text-xs font-mono px-2 py-0.5 rounded ${i === 1 ? 'text-green-400 bg-green-900/20' : 'text-yellow-400 bg-yellow-900/20'}`}>
                                    {i === 1 ? 'PAID' : 'UNPAID'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
