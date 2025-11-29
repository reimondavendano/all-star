'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ReferralRedirect({ params }: { params: { id: string } }) {
    const router = useRouter();

    useEffect(() => {
        // Store referrer ID in sessionStorage
        if (params.id) {
            sessionStorage.setItem('referrer_id', params.id);
        }

        // Redirect to home page
        router.push('/');
    }, [params.id, router]);

    return (
        <div className="min-h-screen bg-[#050505] flex items-center justify-center">
            <div className="text-center">
                <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-white">Redirecting...</p>
            </div>
        </div>
    );
}
