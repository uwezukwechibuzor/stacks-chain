import "dotenv/config";
import { connectDB } from "./db.js";
import { runIndexer } from "./indexer.js";
import { startAPI } from "./api.js";
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function main() {
    // Start API server
    startAPI();
    const startHeight = Number(process.env.START_HEIGHT || 1);
    const pollInterval = Number(process.env.POLL_INTERVAL) || 60000;
    while (true) {
        try {
            // Try to connect if not already connected
            try {
                await connectDB();
            }
            catch (dbError) {
                console.error("❌ Database connection error:", dbError);
                console.log(`⏳ Waiting ${pollInterval / 1000} seconds before retrying connection...`);
                await sleep(pollInterval);
                continue;
            }
            const reachedLatest = await runIndexer(startHeight);
            if (reachedLatest) {
                console.log(`⏳ Reached latest block. Waiting ${pollInterval / 1000} seconds before checking for new blocks...`);
                await sleep(pollInterval);
            }
            else {
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
    console.error("❌ Fatal error in main:", err);
    console.log("🔄 Restarting in 60 seconds...");
    setTimeout(() => {
        main();
    }, 60000);
});
