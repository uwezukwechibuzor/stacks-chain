import { BlockFee } from "./models/blockFee.js";
import { getLatestBlockHeight, getBlock, getBlockFees } from "./hiro.js";
export async function runIndexer(startHeight) {
    const latest = await getLatestBlockHeight();
    console.log(`🔎 Latest block: ${latest}`);
    let height = startHeight;
    while (height <= latest) {
        const exists = await BlockFee.findOne({ block_height: height });
        if (exists) {
            height++;
            continue;
        }
        const block = await getBlock(height);
        const fees = await getBlockFees(height);
        // Validate fees is a valid number
        const validFees = isNaN(fees) || !isFinite(fees) ? 0 : fees;
        await BlockFee.create({
            block_height: height,
            block_timestamp: block.block_time,
            total_fees_stx: validFees
        });
        console.log(`📦 Block ${height} | ${new Date(block.block_time * 1000).toISOString()} | fees ${validFees.toFixed(6)} STX`);
        height++;
    }
    console.log("✅ Indexing complete");
}
