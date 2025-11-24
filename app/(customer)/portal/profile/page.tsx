'use client';

import { User, Mail, Phone, MapPin, Save } from 'lucide-react';

export default function ProfilePage() {
    return (
        <div className="glass-card p-8 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-6">My Profile</h2>
            <form className="space-y-6">
                <div className="flex items-center justify-center mb-8">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center text-white text-3xl font-bold">
                        JD
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Full Name</label>
                        <div className="relative">
                            <User className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                defaultValue="John Doe"
                                className="w-full bg-white/5 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-red-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Email Address</label>
                        <div className="relative">
                            <Mail className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                            <input
                                type="email"
                                defaultValue="john@example.com"
                                className="w-full bg-white/5 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-red-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Mobile Number</label>
                        <div className="relative">
                            <Phone className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                defaultValue="09171234567"
                                className="w-full bg-white/5 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-red-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Installation Address</label>
                        <div className="relative">
                            <MapPin className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                            <textarea
                                defaultValue="123 Main St, Brgy. San Roque, City"
                                rows={3}
                                className="w-full bg-white/5 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-red-500"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <button type="button" className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center">
                        <Save className="w-4 h-4 mr-2" />
                        Save Changes
                    </button>
                </div>
            </form>
        </div>
    );
}
