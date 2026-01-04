import "dotenv/config";
import { connectDB } from "./db.js";
import { runIndexer } from "./indexer.js";
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function main() {
    await connectDB();
    const startHeight = Number(process.env.START_HEIGHT || 1);
    const pollInterval = Number(process.env.POLL_INTERVAL) || 120000; // 2 minutes default
    while (true) {
        try {
            const reachedLatest = await runIndexer(startHeight);
            if (reachedLatest) {
                console.log(`⏳ Reached latest block. Waiting ${pollInterval / 1000} seconds before checking for new blocks...`);
                await sleep(pollInterval);
            }
            else {
                // If we didn't reach latest, there might be more blocks to process
                // Continue immediately
                continue;
            }
        }
        catch (err) {
            console.error("❌ Error in indexer:", err);
            console.log(`⏳ Waiting ${pollInterval / 1000} seconds before retrying...`);
            await sleep(pollInterval);
        }
    }
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
