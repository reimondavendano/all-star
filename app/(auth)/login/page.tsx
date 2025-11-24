'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, ArrowRight, Shield } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (email === 'ced@gmail.com' && password === 'ced@123') {
            // Super Admin
            console.log('Logged in as Super Admin');
            router.push('/admin/dashboard');
        } else if (email === 'mon@gmail.com' && password === 'mon@123') {
            // User Admin
            console.log('Logged in as User Admin');
            router.push('/admin/dashboard');
        } else {
            setError('Invalid email or password');
        }
    };

    return (
        <div className="tech-card p-8 rounded-xl border-red-500/30 shadow-[0_0_30px_rgba(255,0,0,0.2)]">
            <div className="flex items-center justify-center mb-6">
                <Shield className="w-6 h-6 text-red-500 mr-2 animate-pulse" />
                <h2 className="text-2xl font-bold text-white neon-text">System Access</h2>
            </div>

            <p className="text-xs text-gray-500 text-center font-mono mb-6 uppercase">
                Authorized Personnel Only
            </p>

            <form onSubmit={handleLogin} className="space-y-5">
                <div>
                    <label className="block text-xs font-mono text-gray-400 uppercase mb-2">
                        Email Address
                    </label>
                    <div className="relative group">
                        <Mail className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 group-hover:text-red-500 transition-colors" />
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-black/50 border border-gray-800 rounded-lg pl-10 pr-4 py-3 text-white focus:outline-none focus:border-red-500 transition-all font-mono text-sm hover:border-red-900/50"
                            placeholder="admin@allstar.sys"
                            required
                        />
                        <div className="absolute bottom-0 left-0 w-0 h-[1px] bg-red-500 transition-all duration-300 group-focus-within:w-full" />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-mono text-gray-400 uppercase mb-2">
                        Password
                    </label>
                    <div className="relative group">
                        <Lock className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 group-hover:text-red-500 transition-colors" />
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-black/50 border border-gray-800 rounded-lg pl-10 pr-4 py-3 text-white focus:outline-none focus:border-red-500 transition-all font-mono text-sm hover:border-red-900/50"
                            placeholder="••••••••"
                            required
                        />
                        <div className="absolute bottom-0 left-0 w-0 h-[1px] bg-red-500 transition-all duration-300 group-focus-within:w-full" />
                    </div>
                </div>

                {error && (
                    <div className="text-red-400 text-xs text-center bg-red-900/20 border border-red-500/30 p-3 rounded font-mono animate-pulse">
                        <span className="mr-2">⚠</span>
                        {error}
                    </div>
                )}

                <div className="flex items-center justify-between text-xs">
                    <label className="flex items-center text-gray-400 hover:text-white transition-colors cursor-pointer">
                        <input type="checkbox" className="mr-2 rounded bg-black/50 border-gray-800 text-red-600 focus:ring-red-500" />
                        <span className="font-mono">Remember</span>
                    </label>
                    <Link href="#" className="text-red-500 hover:text-red-400 font-mono transition-colors">
                        Reset Access
                    </Link>
                </div>

                <button
                    type="submit"
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition-all flex items-center justify-center shadow-[0_0_20px_rgba(255,0,0,0.3)] hover:shadow-[0_0_30px_rgba(255,0,0,0.5)] group"
                >
                    <span className="font-mono">Authenticate</span>
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-800 text-center">
                <p className="text-xs text-gray-500 font-mono">
                    Test Credentials: <span className="text-red-500">ced@gmail.com</span> / <span className="text-red-500">ced@123</span>
                </p>
            </div>
        </div>
    );
}
