import { BlockFee } from "./models/blockFee.js";
import { getLatestBlockHeight, getBlock, getBlockFees } from "./hiro.js";
async function getLastIndexedHeight() {
    const lastBlock = await BlockFee.findOne()
        .sort({ block_height: -1 })
        .select("block_height")
        .lean();
    return lastBlock ? lastBlock.block_height : 0;
}
async function processBlock(height) {
    try {
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
        console.log(`📦 Block ${height} | ${new Date(block.block_time * 1000).toISOString()} | fees ${validFees.toFixed(6)} STX`);
        return { success: true, height };
    }
    catch (error) {
        console.error(`❌ Error processing block ${height}:`, error);
        return { success: false, height, error };
    }
}
export async function runIndexer(startHeight) {
    const latest = await getLatestBlockHeight();
    console.log(`🔎 Latest block: ${latest}`);
    // Get the last indexed height from database
    const lastIndexed = await getLastIndexedHeight();
    const resumeHeight = Math.max(startHeight, lastIndexed + 1);
    if (lastIndexed > 0) {
        console.log(`📊 Last indexed block: ${lastIndexed}`);
        console.log(`🔄 Resuming from block: ${resumeHeight}`);
    }
    else {
        console.log(`🚀 Starting from block: ${resumeHeight}`);
    }
    const batchSize = Number(process.env.BATCH_SIZE) || 10;
    console.log(`⚡ Processing blocks in batches of ${batchSize}`);
    let height = resumeHeight;
    while (height <= latest) {
        // Get batch of heights to process
        const batchHeights = [];
        for (let i = 0; i < batchSize && height + i <= latest; i++) {
            batchHeights.push(height + i);
        }
        // Check which blocks already exist in database
        const existingBlocks = await BlockFee.find({
            block_height: { $in: batchHeights }
        }).select("block_height").lean();
        const existingHeights = new Set(existingBlocks.map(b => b.block_height));
        const blocksToProcess = batchHeights.filter(h => !existingHeights.has(h));
        if (blocksToProcess.length === 0) {
            console.log(`⏭️  Blocks ${batchHeights[0]}-${batchHeights[batchHeights.length - 1]} already indexed, skipping...`);
            height += batchSize;
            continue;
        }
        // Process blocks in batch concurrently
        const results = await Promise.all(blocksToProcess.map(h => processBlock(h)));
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        if (successful > 0) {
            console.log(`✅ Processed ${successful} block(s) in batch`);
        }
        if (failed > 0) {
            console.log(`⚠️  Failed to process ${failed} block(s) in batch`);
        }
        height += batchSize;
    }
    // Check if we've indexed up to the latest block
    const lastIndexedAfter = await getLastIndexedHeight();
    const reachedLatest = lastIndexedAfter >= latest;
    if (reachedLatest) {
        console.log(`✅ Indexing complete. Indexed up to block ${lastIndexedAfter} (latest: ${latest})`);
    }
    return reachedLatest;
}
