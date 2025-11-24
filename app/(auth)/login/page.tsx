'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, ArrowRight, Shield, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
    const router = useRouter();
    const { login, user } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [authenticatedUser, setAuthenticatedUser] = useState<any>(null);

    // If already logged in, redirect to dashboard
    useEffect(() => {
        if (user) {
            router.push('/admin/dashboard');
        }
    }, [user, router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            // Call the secure RPC function to verify credentials
            const { data, error } = await supabase
                .rpc('login_user', {
                    p_email: email,
                    p_password: password
                });

            if (error) throw error;

            if (data && data.length > 0) {
                const userData = data[0];
                console.log('Login successful:', userData);

                // Store user data and show success modal
                setAuthenticatedUser(userData);
                setShowSuccessModal(true);

                // Auto-proceed after 2 seconds
                setTimeout(() => {
                    login(userData);
                }, 2000);
            } else {
                setError('Invalid email or password');
            }
        } catch (err) {
            console.error('Login error:', err);
            setError('Authentication failed. Please check your credentials.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleProceed = () => {
        if (authenticatedUser) {
            login(authenticatedUser);
        }
    };

    return (
        <>
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
                        disabled={isLoading}
                        className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition-all flex items-center justify-center shadow-[0_0_20px_rgba(255,0,0,0.3)] hover:shadow-[0_0_30px_rgba(255,0,0,0.5)] group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <>
                                <span className="font-mono">Authenticate</span>
                                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-6 pt-6 border-t border-gray-800 text-center">
                    <p className="text-xs text-gray-500 font-mono">
                        System v1.0.0
                    </p>
                </div>
            </div>

            {/* Success Modal */}
            {showSuccessModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" />
                    <div className="relative bg-[#0a0a0a] border border-green-500/30 rounded-xl shadow-[0_0_50px_rgba(0,255,0,0.3)] w-full max-w-md p-8 animate-in zoom-in duration-300">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-20 h-20 bg-green-500/10 border-2 border-green-500 rounded-full flex items-center justify-center mb-6 animate-pulse">
                                <CheckCircle className="w-10 h-10 text-green-500" />
                            </div>

                            <h3 className="text-2xl font-bold text-white mb-2 neon-text-green font-mono">
                                ACCESS GRANTED
                            </h3>

                            <p className="text-green-400 text-sm font-mono mb-2">
                                Authentication Successful
                            </p>

                            <div className="w-full bg-black/50 border border-green-900/30 rounded p-4 mb-6 mt-4">
                                <div className="space-y-2 text-left text-xs font-mono">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">USER:</span>
                                        <span className="text-green-400">{authenticatedUser?.full_name}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">ROLE:</span>
                                        <span className="text-green-400 uppercase">{authenticatedUser?.role?.replace('_', ' ')}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">STATUS:</span>
                                        <span className="text-green-400">AUTHORIZED</span>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleProceed}
                                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition-all flex items-center justify-center shadow-[0_0_20px_rgba(0,255,0,0.3)] hover:shadow-[0_0_30px_rgba(0,255,0,0.5)] group font-mono"
                            >
                                <span>PROCEED TO SYSTEM</span>
                                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                            </button>

                            <p className="text-xs text-gray-500 mt-4 font-mono">
                                Auto-redirecting in 2 seconds...
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                .neon-text-green {
                    text-shadow: 0 0 10px rgba(0, 255, 0, 0.5),
                                 0 0 20px rgba(0, 255, 0, 0.3),
                                 0 0 30px rgba(0, 255, 0, 0.2);
                }
            `}</style>
        </>
    );
}
