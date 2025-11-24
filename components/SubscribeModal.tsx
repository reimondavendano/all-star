'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface SubscribeModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function SubscribeModal({ isOpen, onClose }: SubscribeModalProps) {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        mobileNumber: '',
        address: '',
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Create customer ID
        const customerId = `cust-${Date.now()}`;

        // Store customer data (in a real app, this would be sent to backend)
        console.log('New customer:', { id: customerId, ...formData });

        // Redirect to customer portal
        window.location.href = '/portal';
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            <div className="relative tech-card p-8 rounded-xl max-w-md w-full border-red-500/30 shadow-[0_0_30px_rgba(255,0,0,0.3)]">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                >
                    <X className="w-6 h-6" />
                </button>

                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-white neon-text mb-2">Subscribe Now</h2>
                    <p className="text-sm text-gray-400 font-mono">Join the ALLSTAR network</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-mono text-gray-400 uppercase mb-2">
                            Full Name *
                        </label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            required
                            className="w-full bg-black/50 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500 transition-colors"
                            placeholder="Enter your full name"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-mono text-gray-400 uppercase mb-2">
                            Email Address *
                        </label>
                        <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            required
                            className="w-full bg-black/50 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500 transition-colors"
                            placeholder="your.email@example.com"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-mono text-gray-400 uppercase mb-2">
                            Mobile Number *
                        </label>
                        <input
                            type="tel"
                            name="mobileNumber"
                            value={formData.mobileNumber}
                            onChange={handleChange}
                            required
                            className="w-full bg-black/50 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500 transition-colors"
                            placeholder="09171234567"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-mono text-gray-400 uppercase mb-2">
                            Address *
                        </label>
                        <textarea
                            name="address"
                            value={formData.address}
                            onChange={handleChange}
                            required
                            rows={3}
                            className="w-full bg-black/50 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500 transition-colors resize-none"
                            placeholder="Enter your complete address"
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-semibold transition-all hover:shadow-[0_0_20px_rgba(255,0,0,0.5)] mt-6"
                    >
                        Subscribe
                    </button>
                </form>
            </div>
        </div>
    );
}
