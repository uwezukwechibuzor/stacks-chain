import { BlockFee } from "./models/blockFee.js";
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

      return { success: true, height };
    } catch (error) {
      const isTransientError = error instanceof Error && (
        error.message.includes("SSL") ||
        error.message.includes("ECONNRESET") ||
        error.message.includes("ETIMEDOUT") ||
        error.message.includes("ENOTFOUND")
      );

      if (attempt < retries && isTransientError) {
        const backoffDelay = delay * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`⚠️  Block ${height} failed (attempt ${attempt}/${retries}), retrying in ${backoffDelay}ms...`);
        await sleep(backoffDelay);
        continue;
      }

      console.error(`❌ Error processing block ${height} (attempt ${attempt}/${retries}):`, error instanceof Error ? error.message : error);
      return { success: false, height, error };
    }
  }
  
  return { success: false, height, error: "Max retries exceeded" };
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
        const retryResult = await processBlock(failedHeight, 5, 2000); // More retries for failed blocks
        if (retryResult.success) {
          console.log(`✅ Successfully processed block ${failedHeight} on retry`);
        } else {
          console.error(`❌ Block ${failedHeight} failed after all retries - will be retried in next run`);
        }
      }
    }

    height += batchSize;
  }

  // Check for any gaps in indexed blocks and retry them
  console.log("🔍 Checking for gaps in indexed blocks...");
  const indexedBlocks = await BlockFee.find({
    block_height: { $gte: resumeHeight, $lte: latest }
  })
    .select("block_height")
    .sort({ block_height: 1 })
    .lean();

  const indexedHeights = new Set(
    (indexedBlocks as unknown as { block_height: number }[]).map(b => b.block_height)
  );

  const gaps: number[] = [];

  for (let h = resumeHeight; h <= latest; h++) {
    if (!indexedHeights.has(h)) {
      gaps.push(h);
    }
  }

  if (gaps.length > 0) {
    console.log(`⚠️  Found ${gaps.length} missing block(s), retrying...`);
    for (const gapHeight of gaps) {
      const retryResult = await processBlock(gapHeight, 5, 2000);
      if (retryResult.success) {
        console.log(`✅ Filled gap: block ${gapHeight}`);
      } else {
        console.error(`❌ Failed to fill gap: block ${gapHeight}`);
      }
    }
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
