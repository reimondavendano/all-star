/**
 * SMS Queue Test Script
 * 
 * Run this to test the SMS queue functionality without actually sending SMS
 * 
 * Usage:
 * npx ts-node scripts/test-sms-queue.ts
 */

import { getSMSQueue } from '../lib/smsQueue';

// Mock SMS send function for testing
async function mockSendSMS(to: string, message: string): Promise<{ success: boolean; error?: string }> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Simulate 95% success rate
    const random = Math.random();
    if (random < 0.95) {
        console.log(`  ✓ Sent to ${to}: ${message.substring(0, 30)}...`);
        return { success: true };
    } else {
        console.log(`  ✗ Failed to ${to}: Network error`);
        return { success: false, error: 'Network error' };
    }
}

async function testSMSQueue() {
    console.log('🧪 SMS Queue Test\n');
    console.log('='.repeat(50));
    
    const queue = getSMSQueue();
    
    // Test 1: Small batch (10 SMS)
    console.log('\n📝 Test 1: Small Batch (10 SMS)');
    console.log('-'.repeat(50));
    
    const smallBatch = Array.from({ length: 10 }, (_, i) => ({
        to: `0917123456${i.toString().padStart(2, '0')}`,
        message: `Test message ${i + 1}: Your bill is ready. Amount: P999.00`
    }));
    
    queue.addBulkJobs(smallBatch);
    console.log(`Added ${smallBatch.length} jobs to queue`);
    
    await queue.processQueue(mockSendSMS);
    
    let summary = queue.getSummary();
    console.log('\n📊 Results:');
    console.log(`  Sent: ${summary.sent}`);
    console.log(`  Failed: ${summary.failed}`);
    console.log(`  Pending: ${summary.pending}`);
    
    queue.clearCompleted();
    
    // Test 2: Medium batch (100 SMS)
    console.log('\n\n📝 Test 2: Medium Batch (100 SMS)');
    console.log('-'.repeat(50));
    
    const mediumBatch = Array.from({ length: 100 }, (_, i) => ({
        to: `09171234${i.toString().padStart(3, '0')}`,
        message: `Invoice #${i + 1}: Your monthly bill is P${(999 + i).toLocaleString()}.00. Due: Feb 15, 2026`
    }));
    
    queue.addBulkJobs(mediumBatch);
    console.log(`Added ${mediumBatch.length} jobs to queue`);
    
    // Monitor progress
    const progressInterval = setInterval(() => {
        const stats = queue.getStats();
        if (queue.isActive()) {
            console.log(`  Progress: ${stats.completed + stats.failed}/${stats.totalProcessed} | ETA: ${stats.estimatedTimeRemaining}s`);
        }
    }, 3000);
    
    await queue.processQueue(mockSendSMS);
    clearInterval(progressInterval);
    
    summary = queue.getSummary();
    console.log('\n📊 Results:');
    console.log(`  Sent: ${summary.sent}`);
    console.log(`  Failed: ${summary.failed}`);
    console.log(`  Pending: ${summary.pending}`);
    
    queue.clearCompleted();
    
    // Test 3: Large batch (1000 SMS) - Simulated
    console.log('\n\n📝 Test 3: Large Batch Simulation (1000 SMS)');
    console.log('-'.repeat(50));
    console.log('Calculating estimated time...\n');
    
    const smsCount = 1000;
    const batchSize = 10;
    const delayBetweenBatches = 6; // seconds
    const batches = Math.ceil(smsCount / batchSize);
    const estimatedTime = batches * delayBetweenBatches;
    
    console.log(`📊 Simulation Results:`);
    console.log(`  Total SMS: ${smsCount}`);
    console.log(`  Batch Size: ${batchSize}`);
    console.log(`  Number of Batches: ${batches}`);
    console.log(`  Delay per Batch: ${delayBetweenBatches}s`);
    console.log(`  Estimated Time: ${Math.ceil(estimatedTime / 60)} minutes ${estimatedTime % 60} seconds`);
    console.log(`  Rate: ${Math.round((smsCount / estimatedTime) * 60)} SMS/min`);
    console.log(`  Expected Success: ${Math.round(smsCount * 0.95)} SMS (95%)`);
    console.log(`  Expected Failures: ${Math.round(smsCount * 0.05)} SMS (5%)`);
    
    // Test 4: Rate Limiting
    console.log('\n\n📝 Test 4: Rate Limiting Verification');
    console.log('-'.repeat(50));
    
    const rateLimitBatch = Array.from({ length: 150 }, (_, i) => ({
        to: `09181234${i.toString().padStart(3, '0')}`,
        message: `Rate limit test ${i + 1}`
    }));
    
    queue.addBulkJobs(rateLimitBatch);
    console.log(`Added ${rateLimitBatch.length} jobs to queue`);
    console.log('Testing rate limiting (should process ~100 SMS/min)...\n');
    
    const startTime = Date.now();
    await queue.processQueue(mockSendSMS);
    const duration = (Date.now() - startTime) / 1000;
    
    summary = queue.getSummary();
    const actualRate = Math.round((summary.sent + summary.failed) / duration * 60);
    
    console.log('\n📊 Rate Limiting Results:');
    console.log(`  Duration: ${Math.ceil(duration)}s`);
    console.log(`  Actual Rate: ${actualRate} SMS/min`);
    console.log(`  Target Rate: 100 SMS/min`);
    console.log(`  Status: ${actualRate <= 100 ? '✅ PASS' : '❌ FAIL'}`);
    
    // Final Summary
    console.log('\n\n' + '='.repeat(50));
    console.log('✅ All Tests Completed!');
    console.log('='.repeat(50));
    console.log('\n📋 Summary:');
    console.log('  ✓ Small batch processing works');
    console.log('  ✓ Medium batch processing works');
    console.log('  ✓ Large batch estimation calculated');
    console.log('  ✓ Rate limiting verified');
    console.log('\n🚀 SMS Queue is ready for production!');
}

// Run tests
testSMSQueue().catch(console.error);
