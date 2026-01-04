'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const BUCKET_NAME = 'allstar';

export async function verifyPayment(paymentId: string) {
    try {
        // 1. Get the payment to check its current notes
        const { data: payment, error: fetchError } = await supabase
            .from('payments')
            .select('notes, subscription_id')
            .eq('id', paymentId)
            .single();

        if (fetchError || !payment) throw new Error('Payment not found');

        // 2. Remove " (Pending Verification)" from notes
        const newNotes = payment.notes ? payment.notes.replace(/\s*\(Pending Verification\)/i, '').trim() : 'Manual Payment';
        const finalNotes = newNotes.includes('Verified') ? newNotes : `${newNotes} - Verified`;

        const { error: updateError } = await supabase
            .from('payments')
            .update({ notes: finalNotes })
            .eq('id', paymentId);

        if (updateError) throw updateError;

        revalidatePath('/admin/verification');
        revalidatePath('/admin/dashboard');

        return { success: true };

    } catch (error: any) {
        console.error('Verify Payment Error:', error);
        return { success: false, error: error.message };
    }
}

export async function voidPayment(paymentId: string) {
    try {
        // 1. Get payment details to revert balance
        const { data: payment, error: fetchError } = await supabase
            .from('payments')
            .select('*')
            .eq('id', paymentId)
            .single();

        if (fetchError || !payment) throw new Error('Payment not found');

        const amount = payment.amount;
        const subId = payment.subscription_id;

        // 2. Delete the payment
        const { error: deleteError } = await supabase
            .from('payments')
            .delete()
            .eq('id', paymentId);

        if (deleteError) throw deleteError;

        // 3. Revert Subscription Balance
        const { data: sub, error: subError } = await supabase
            .from('subscriptions')
            .select('balance')
            .eq('id', subId)
            .single();

        if (sub && !subError) {
            const newBalance = (sub.balance || 0) + amount;
            await supabase
                .from('subscriptions')
                .update({ balance: newBalance })
                .eq('id', subId);
        }

        // 4. Update Invoice Status (Recalculate)
        if (payment.invoice_id) {
            const { data: allPayments } = await supabase
                .from('payments')
                .select('amount')
                .eq('invoice_id', payment.invoice_id);

            const totalPaid = allPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

            const { data: invoice } = await supabase
                .from('invoices')
                .select('amount_due')
                .eq('id', payment.invoice_id)
                .single();

            if (invoice) {
                let status = 'Unpaid';
                if (totalPaid >= invoice.amount_due) status = 'Paid';
                else if (totalPaid > 0) status = 'Partially Paid';

                await supabase
                    .from('invoices')
                    .update({ payment_status: status })
                    .eq('id', payment.invoice_id);
            }
        }

        revalidatePath('/admin/verification');
        revalidatePath('/admin/dashboard');

        return { success: true };

    } catch (error: any) {
        console.error('Void Payment Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Upload QR Code to Supabase Storage
 */
export async function uploadPaymentQR(formData: FormData) {
    try {
        const file = formData.get('file') as File;
        const businessUnit = formData.get('businessUnit') as string;
        const provider = formData.get('provider') as string;
        const accountName = formData.get('accountName') as string;
        const accountNumber = formData.get('accountNumber') as string;

        if (!file || !businessUnit || !provider) {
            throw new Error('Missing file or details');
        }

        // Normalize filename: unit-provider.jpg
        const unitSlug = businessUnit.toLowerCase().replace(/\s+/g, '-');
        const providerSlug = provider.toLowerCase().replace(/\s+/g, '-');
        const fileName = `payment-methods/${unitSlug}-${providerSlug}.jpg`;

        // Convert file to buffer
        const buffer = Buffer.from(await file.arrayBuffer());

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(fileName, buffer, {
                contentType: 'image/jpeg',
                upsert: true // Overwrite if exists
            });

        if (uploadError) {
            console.error('Storage upload error:', uploadError);
            throw new Error(`Upload failed: ${uploadError.message}`);
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(fileName);

        const publicUrl = urlData?.publicUrl;

        // Save account details to a JSON file in storage (or you could use a DB table)
        if (accountName || accountNumber) {
            // First, try to download existing accounts.json
            let accountsData: Record<string, any> = {};

            try {
                const { data: existingData, error: downloadError } = await supabase.storage
                    .from(BUCKET_NAME)
                    .download('payment-methods/accounts.json');

                if (existingData && !downloadError) {
                    const text = await existingData.text();
                    accountsData = JSON.parse(text);
                }
            } catch (e) {
                // File doesn't exist yet, that's fine
                console.log('No existing accounts.json, creating new one');
            }

            const key = `${unitSlug}-${providerSlug}`;
            accountsData[key] = {
                accountName,
                accountNumber,
                imageUrl: publicUrl,
                updatedAt: new Date().toISOString()
            };

            // Upload updated accounts.json
            const jsonBuffer = Buffer.from(JSON.stringify(accountsData, null, 2));
            await supabase.storage
                .from(BUCKET_NAME)
                .upload('payment-methods/accounts.json', jsonBuffer, {
                    contentType: 'application/json',
                    upsert: true
                });
        }

        revalidatePath('/admin/verification');

        return { success: true, fileName, publicUrl };

    } catch (error: any) {
        console.error('Upload Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get accounts.json from Supabase Storage
 */
export async function getPaymentAccounts() {
    try {
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .download('payment-methods/accounts.json');

        if (error || !data) {
            return { success: true, accounts: {} };
        }

        const text = await data.text();
        const accounts = JSON.parse(text);

        return { success: true, accounts };
    } catch (error: any) {
        console.error('Get accounts error:', error);
        return { success: false, accounts: {}, error: error.message };
    }
}
