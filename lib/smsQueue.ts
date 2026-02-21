/**
 * SMS Queue with Rate Limiting
 * 
 * Implements a robust queue system to handle SMS sending with rate limiting
 * to comply with Semaphore API limits (120 requests per minute)
 * 
 * Features:
 * - Rate limiting: Max 100 SMS per minute (safe buffer below 120 limit)
 * - Automatic retry on failure (3 attempts)
 * - Queue persistence (in-memory, can be extended to database)
 * - Progress tracking
 * - Error handling and logging
 */

interface SMSJob {
    id: string;
    to: string;
    message: string;
    attempts: number;
    maxAttempts: number;
    createdAt: Date;
    lastAttemptAt?: Date;
    error?: string;
}

interface QueueStats {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    totalProcessed: number;
    startTime: Date;
    estimatedTimeRemaining: number; // in seconds
}

class SMSQueue {
    private queue: SMSJob[] = [];
    private processing: Set<string> = new Set();
    private completed: Map<string, { success: boolean; error?: string }> = new Map();
    private isProcessing: boolean = false;
    
    // Rate limiting configuration
    private readonly MAX_SMS_PER_MINUTE = 100; // Safe buffer below Semaphore's 120 limit
    private readonly BATCH_SIZE = 10; // Process 10 SMS at a time
    private readonly DELAY_BETWEEN_BATCHES = 6000; // 6 seconds (10 batches per minute = 100 SMS/min)
    private readonly MAX_RETRIES = 3;
    
    private sentInCurrentMinute: number = 0;
    private minuteStartTime: number = Date.now();
    private stats: QueueStats = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        totalProcessed: 0,
        startTime: new Date(),
        estimatedTimeRemaining: 0
    };

    /**
     * Add SMS job to queue
     */
    addJob(to: string, message: string): string {
        const jobId = `sms_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const job: SMSJob = {
            id: jobId,
            to,
            message,
            attempts: 0,
            maxAttempts: this.MAX_RETRIES,
            createdAt: new Date()
        };

        this.queue.push(job);
        this.stats.pending++;
        
        console.log(`[SMS Queue] Job added: ${jobId} (Queue size: ${this.queue.length})`);
        
        return jobId;
    }

    /**
     * Add multiple SMS jobs to queue
     */
    addBulkJobs(messages: Array<{ to: string; message: string }>): string[] {
        const jobIds: string[] = [];
        
        for (const msg of messages) {
            const jobId = this.addJob(msg.to, msg.message);
            jobIds.push(jobId);
        }
        
        console.log(`[SMS Queue] ${jobIds.length} jobs added to queue`);
        return jobIds;
    }

    /**
     * Process the queue with rate limiting
     */
    async processQueue(sendSMSFunction: (to: string, message: string) => Promise<{ success: boolean; error?: string }>): Promise<void> {
        if (this.isProcessing) {
            console.log('[SMS Queue] Already processing, skipping...');
            return;
        }

        if (this.queue.length === 0) {
            console.log('[SMS Queue] Queue is empty');
            return;
        }

        this.isProcessing = true;
        console.log(`[SMS Queue] Starting to process ${this.queue.length} jobs`);
        this.stats.startTime = new Date();

        try {
            while (this.queue.length > 0) {
                // Reset rate limit counter every minute
                const now = Date.now();
                if (now - this.minuteStartTime >= 60000) {
                    this.sentInCurrentMinute = 0;
                    this.minuteStartTime = now;
                    console.log('[SMS Queue] Rate limit counter reset');
                }

                // Check if we've hit the rate limit
                if (this.sentInCurrentMinute >= this.MAX_SMS_PER_MINUTE) {
                    const waitTime = 60000 - (now - this.minuteStartTime);
                    console.log(`[SMS Queue] Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)}s...`);
                    await this.sleep(waitTime);
                    this.sentInCurrentMinute = 0;
                    this.minuteStartTime = Date.now();
                }

                // Get next batch
                const batch = this.queue.splice(0, Math.min(this.BATCH_SIZE, this.queue.length));
                this.stats.pending = this.queue.length;
                
                console.log(`[SMS Queue] Processing batch of ${batch.length} jobs (${this.queue.length} remaining)`);

                // Process batch in parallel
                const batchPromises = batch.map(job => this.processJob(job, sendSMSFunction));
                await Promise.all(batchPromises);

                this.sentInCurrentMinute += batch.length;
                this.stats.totalProcessed += batch.length;

                // Update estimated time remaining
                this.updateEstimatedTime();

                // Delay between batches to maintain rate limit
                if (this.queue.length > 0) {
                    console.log(`[SMS Queue] Waiting ${this.DELAY_BETWEEN_BATCHES / 1000}s before next batch...`);
                    await this.sleep(this.DELAY_BETWEEN_BATCHES);
                }
            }

            console.log('[SMS Queue] All jobs processed');
            this.logFinalStats();

        } catch (error) {
            console.error('[SMS Queue] Error processing queue:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Process individual SMS job with retry logic
     */
    private async processJob(
        job: SMSJob,
        sendSMSFunction: (to: string, message: string) => Promise<{ success: boolean; error?: string }>
    ): Promise<void> {
        this.processing.add(job.id);
        this.stats.processing++;
        job.attempts++;
        job.lastAttemptAt = new Date();

        try {
            console.log(`[SMS Queue] Sending to ${job.to} (Attempt ${job.attempts}/${job.maxAttempts})`);
            
            const result = await sendSMSFunction(job.to, job.message);

            if (result.success) {
                this.completed.set(job.id, { success: true });
                this.stats.completed++;
                console.log(`[SMS Queue] ✓ Success: ${job.id}`);
            } else {
                // Retry if attempts remaining
                if (job.attempts < job.maxAttempts) {
                    console.log(`[SMS Queue] ✗ Failed: ${job.id}. Retrying... (${result.error})`);
                    job.error = result.error;
                    this.queue.push(job); // Re-queue for retry
                    this.stats.pending++;
                } else {
                    this.completed.set(job.id, { success: false, error: result.error });
                    this.stats.failed++;
                    console.log(`[SMS Queue] ✗ Failed permanently: ${job.id} (${result.error})`);
                }
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            
            if (job.attempts < job.maxAttempts) {
                console.log(`[SMS Queue] ✗ Exception: ${job.id}. Retrying... (${errorMsg})`);
                job.error = errorMsg;
                this.queue.push(job);
                this.stats.pending++;
            } else {
                this.completed.set(job.id, { success: false, error: errorMsg });
                this.stats.failed++;
                console.log(`[SMS Queue] ✗ Failed permanently: ${job.id} (${errorMsg})`);
            }
        } finally {
            this.processing.delete(job.id);
            this.stats.processing--;
        }
    }

    /**
     * Get current queue statistics
     */
    getStats(): QueueStats {
        return {
            ...this.stats,
            pending: this.queue.length,
            processing: this.processing.size
        };
    }

    /**
     * Get results for specific job IDs
     */
    getResults(jobIds: string[]): Map<string, { success: boolean; error?: string }> {
        const results = new Map();
        for (const jobId of jobIds) {
            const result = this.completed.get(jobId);
            if (result) {
                results.set(jobId, result);
            }
        }
        return results;
    }

    /**
     * Clear completed jobs from memory
     */
    clearCompleted(): void {
        this.completed.clear();
        this.stats.completed = 0;
        this.stats.failed = 0;
        this.stats.totalProcessed = 0;
        console.log('[SMS Queue] Completed jobs cleared');
    }

    /**
     * Get summary of results
     */
    getSummary(): { sent: number; failed: number; pending: number } {
        return {
            sent: this.stats.completed,
            failed: this.stats.failed,
            pending: this.queue.length
        };
    }

    /**
     * Update estimated time remaining
     */
    private updateEstimatedTime(): void {
        const elapsed = (Date.now() - this.stats.startTime.getTime()) / 1000;
        const rate = this.stats.totalProcessed / elapsed; // jobs per second
        
        if (rate > 0) {
            this.stats.estimatedTimeRemaining = Math.ceil(this.queue.length / rate);
        }
    }

    /**
     * Log final statistics
     */
    private logFinalStats(): void {
        const duration = (Date.now() - this.stats.startTime.getTime()) / 1000;
        console.log('\n[SMS Queue] ========== FINAL STATS ==========');
        console.log(`Total Processed: ${this.stats.totalProcessed}`);
        console.log(`Successful: ${this.stats.completed}`);
        console.log(`Failed: ${this.stats.failed}`);
        console.log(`Duration: ${Math.ceil(duration)}s`);
        console.log(`Average Rate: ${(this.stats.totalProcessed / duration * 60).toFixed(2)} SMS/min`);
        console.log('==========================================\n');
    }

    /**
     * Sleep utility
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Check if queue is currently processing
     */
    isActive(): boolean {
        return this.isProcessing;
    }

    /**
     * Get queue size
     */
    size(): number {
        return this.queue.length;
    }
}

// Singleton instance
let queueInstance: SMSQueue | null = null;

/**
 * Get or create SMS queue instance
 */
export function getSMSQueue(): SMSQueue {
    if (!queueInstance) {
        queueInstance = new SMSQueue();
    }
    return queueInstance;
}

/**
 * Helper function to send bulk SMS with rate limiting
 */
export async function sendBulkSMSWithRateLimit(
    messages: Array<{ to: string; message: string }>,
    sendSMSFunction: (to: string, message: string) => Promise<{ success: boolean; error?: string }>
): Promise<{ sent: number; failed: number; pending: number }> {
    const queue = getSMSQueue();
    
    // Add all messages to queue
    queue.addBulkJobs(messages);
    
    // Process queue
    await queue.processQueue(sendSMSFunction);
    
    // Return summary
    return queue.getSummary();
}
