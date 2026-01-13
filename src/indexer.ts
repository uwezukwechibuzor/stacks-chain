import { BlockFee } from "./models/blockFee.js";
import { FailedBlock } from "./models/failedBlock.js";
import {
  getLatestBlockHeight,
  getBlock,
  getBlockFees
} from "./hiro.js";

async function getLastIndexedHeight(): Promise<number> {
  const lastBlock = await BlockFee.findOne()
    .sort({ block_height: -1 })
    .select("block_height")
    .lean() as { block_height: number } | null;
  
  return lastBlock ? lastBlock.block_height : 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processBlock(height: number, retries = 3, delay = 1000): Promise<{ success: boolean; height: number; error?: any }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Check if block already exists 
      const exists = await BlockFee.findOne({ block_height: height });
      if (exists) {
        return { success: true, height };
      }

      const [block, fees] = await Promise.all([
        getBlock(height),
        getBlockFees(height)
      ]);

      const validFees = isNaN(fees) || !isFinite(fees) ? 0 : fees;

      await BlockFee.create({
        block_height: height,
        block_timestamp: block.block_time,
        total_fees_stx: validFees
      });

      console.log(
        `📦 Block ${height} | ${new Date(
          block.block_time * 1000
        ).toISOString()} | fees ${validFees.toFixed(6)} STX`
      );

      // Successfully processed - remove from failed blocks if it was there
      await removeFailedBlock(height);
      return { success: true, height };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRateLimit = errorMessage.includes("429") || errorMessage.includes("Too Many Requests");
      const isTransientError = error instanceof Error && (
        errorMessage.includes("SSL") ||
        errorMessage.includes("ECONNRESET") ||
        errorMessage.includes("ETIMEDOUT") ||
        errorMessage.includes("ENOTFOUND") ||
        isRateLimit
      );

      if (attempt < retries && isTransientError) {
        // Use longer backoff for rate limits (429 errors)
        const baseDelay = isRateLimit ? delay * 5 : delay;
        const backoffDelay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`⚠️  Block ${height} failed (attempt ${attempt}/${retries})${isRateLimit ? " - rate limited" : ""}, retrying in ${backoffDelay}ms...`);
        await sleep(backoffDelay);
        continue;
      }

      console.error(`❌ Error processing block ${height} (attempt ${attempt}/${retries}):`, errorMessage);
      // Track failed block in database
      await trackFailedBlock(height, error);
      return { success: false, height, error };
    }
  }
  
  return { success: false, height, error: "Max retries exceeded" };
}

async function trackFailedBlock(height: number, error: any): Promise<void> {
  try {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await FailedBlock.findOneAndUpdate(
      { block_height: height },
      {
        block_height: height,
        error_message: errorMessage,
        failed_at: new Date(),
        $inc: { retry_count: 1 }
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error(`Failed to track failed block ${height}:`, err);
  }
}

async function removeFailedBlock(height: number): Promise<void> {
  try {
    await FailedBlock.deleteOne({ block_height: height });
  } catch (err) {
    console.error(`Failed to remove failed block ${height}:`, err);
  }
}

async function getFailedBlocks(): Promise<number[]> {
  try {
    const failedBlocks = await FailedBlock.find({})
      .select("block_height")
      .lean() as unknown as { block_height: number }[];
    return failedBlocks.map(b => b.block_height);
  } catch (err) {
    console.error("Failed to fetch failed blocks:", err);
    return [];
  }
}

export async function runIndexer(startHeight: number) {
  const latest = await getLatestBlockHeight();
  console.log(`🔎 Latest block: ${latest}`);

  // Get the last indexed height from database
  const lastIndexed = await getLastIndexedHeight();
  const resumeHeight = Math.max(startHeight, lastIndexed + 1);
  
  if (lastIndexed > 0) {
    console.log(`📊 Last indexed block: ${lastIndexed}`);
    console.log(`🔄 Resuming from block: ${resumeHeight}`);
  } else {
    console.log(`🚀 Starting from block: ${resumeHeight}`);
  }

  // Track failed blocks in memory during this run
  const currentRunFailedBlocks = new Set<number>();

  const batchSize = Number(process.env.BATCH_SIZE) || 5;
  console.log(`⚡ Processing blocks in batches of ${batchSize}`);

  let height = resumeHeight;

  while (height <= latest) {
    // Get batch of heights to process
    const batchHeights: number[] = [];
    for (let i = 0; i < batchSize && height + i <= latest; i++) {
      batchHeights.push(height + i);
    }

    // Check which blocks already exist in database
    const existingBlocks = await BlockFee.find({
      block_height: { $in: batchHeights }
    }).select("block_height").lean();

    const existingHeights = new Set(
      (existingBlocks as unknown as { block_height: number }[]).map(b => b.block_height)
    );
    const blocksToProcess = batchHeights.filter(h => !existingHeights.has(h));

    if (blocksToProcess.length === 0) {
      console.log(`⏭️  Blocks ${batchHeights[0]}-${batchHeights[batchHeights.length - 1]} already indexed, skipping...`);
      height += batchSize;
      continue;
    }

    // Process blocks in batch concurrently
    const results = await Promise.all(
      blocksToProcess.map(h => processBlock(h))
    );

    const successful = results.filter(r => r.success).length;
    const failedBlocks = results.filter(r => !r.success).map(r => r.height);

    if (successful > 0) {
      console.log(`✅ Processed ${successful} block(s) in batch`);
    }

    // Retry failed blocks sequentially to ensure no gaps
    if (failedBlocks.length > 0) {
      console.log(`🔄 Retrying ${failedBlocks.length} failed block(s) sequentially...`);
      for (const failedHeight of failedBlocks) {
        currentRunFailedBlocks.add(failedHeight);
        const retryResult = await processBlock(failedHeight, 5, 2000); // More retries for failed blocks
        if (retryResult.success) {
          currentRunFailedBlocks.delete(failedHeight);
          console.log(`✅ Successfully processed block ${failedHeight} on retry`);
        } else {
          console.error(`❌ Block ${failedHeight} failed after all retries - tracked for next run`);
        }
      }
    }

    height += batchSize;
  }

  // Retry previously failed blocks from database
  // This is much more efficient than scanning all blocks - we only query failed blocks
  console.log("🔍 Checking for previously failed blocks...");
  const previouslyFailedBlocks = await getFailedBlocks();
  
  // Filter to only blocks we care about (within range and not already processed successfully this run)
  const blocksToRetry = previouslyFailedBlocks.filter(h => {
    // Only retry blocks within our range
    if (h < startHeight || h > latest) return false;
    // Skip blocks that failed again in this run (they're already tracked)
    if (currentRunFailedBlocks.has(h)) return false;
    // processBlock will check if block already exists, so we can retry all others
    return true;
  });

  if (blocksToRetry.length > 0) {
    console.log(`🔄 Retrying ${blocksToRetry.length} previously failed block(s)...`);
    for (const failedHeight of blocksToRetry) {
      const retryResult = await processBlock(failedHeight, 5, 2000);
      if (retryResult.success) {
        console.log(`✅ Successfully processed previously failed block ${failedHeight}`);
      } else {
        console.error(`❌ Block ${failedHeight} still failing - will retry in next run`);
      }
    }
  } else {
    console.log("✅ No previously failed blocks to retry");
  }

  // Check if we've indexed up to the latest block
  const lastIndexedAfter = await getLastIndexedHeight();
  const reachedLatest = lastIndexedAfter >= latest;
  
  if (reachedLatest) {
    console.log(`✅ Indexing complete. Indexed up to block ${lastIndexedAfter} (latest: ${latest})`);
  } else {
    console.log(`📊 Indexed up to block ${lastIndexedAfter}, latest is ${latest}`);
  }

  return reachedLatest;
}
