'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function ReferralRedirect() {
    const router = useRouter();
    const params = useParams();

    useEffect(() => {
        // Store referrer ID in sessionStorage
        if (params?.id) {
            // Ensure id is a string (useParams can return string | string[])
            const referrerId = Array.isArray(params.id) ? params.id[0] : params.id;
            sessionStorage.setItem('referrer_id', referrerId);
        }

        // Redirect to home page
        router.push('/');
    }, [params, router]);

    return (
        <div className="min-h-screen bg-[#050505] flex items-center justify-center">
            <div className="text-center">
                <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-white">Redirecting...</p>
            </div>
        </div>
    );
}
