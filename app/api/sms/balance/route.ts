import { NextResponse } from 'next/server';

export async function GET() {
    const apiKey = process.env.SEMAPHORE_API_KEY;

    if (!apiKey) {
        return NextResponse.json({ error: 'Semaphore API key not configured' }, { status: 500 });
    }

    try {
        const res = await fetch(`https://api.semaphore.co/api/v4/account?apikey=${apiKey}`, {
            cache: 'no-store'
        });

        if (!res.ok) {
            return NextResponse.json({ error: `Semaphore API error: ${res.status}` }, { status: 502 });
        }

        const data = await res.json();

        return NextResponse.json({
            credits: data.credits ?? data.credit_balance ?? null,
            name: data.name ?? null,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
