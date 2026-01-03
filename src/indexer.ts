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

  let height = resumeHeight;

  while (height <= latest) {
    // Double-check if block already exists
    const exists = await BlockFee.findOne({ block_height: height });
    if (exists) {
      console.log(`⏭️  Block ${height} already indexed, skipping...`);
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

    console.log(
      `📦 Block ${height} | ${new Date(
        block.block_time * 1000
      ).toISOString()} | fees ${validFees.toFixed(6)} STX`
    );

    height++;
  }

  console.log("✅ Indexing complete");
}
