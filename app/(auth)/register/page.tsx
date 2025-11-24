'use client';

import Link from 'next/link';
import { Mail, Lock, User, Phone, MapPin, ArrowRight } from 'lucide-react';

export default function RegisterPage() {
    return (
        <div className="glass-card p-8">
            <h2 className="text-2xl font-bold text-white mb-6 text-center">Create Account</h2>
            <form className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Full Name</label>
                        <div className="relative">
                            <User className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                className="w-full bg-white/5 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-red-500"
                                placeholder="John Doe"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Mobile</label>
                        <div className="relative">
                            <Phone className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                className="w-full bg-white/5 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-red-500"
                                placeholder="09123456789"
                            />
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Address</label>
                    <div className="relative">
                        <MapPin className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            className="w-full bg-white/5 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-red-500"
                            placeholder="Street, City, Province"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Email Address</label>
                    <div className="relative">
                        <Mail className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                        <input
                            type="email"
                            className="w-full bg-white/5 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-red-500"
                            placeholder="you@example.com"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
                    <div className="relative">
                        <Lock className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                        <input
                            type="password"
                            className="w-full bg-white/5 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-red-500"
                            placeholder="••••••••"
                        />
                    </div>
                </div>

                <button type="button" className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center">
                    Register
                    <ArrowRight className="w-4 h-4 ml-2" />
                </button>
            </form>

            <div className="mt-6 text-center text-sm text-gray-400">
                Already have an account? <Link href="/login" className="text-red-500 hover:text-red-400">Sign in</Link>
            </div>
        </div>
    );
}
