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
        await BlockFee.create({
            block_height: height,
            block_timestamp: block.block_time,
            total_fees_stx: fees
        });
        console.log(`📦 Block ${height} | ${new Date(block.block_time * 1000).toISOString()} | fees ${fees.toFixed(6)} STX`);
        height++;
    }
    console.log("✅ Indexing complete");
}
