import "dotenv/config";
import { connectDB } from "./db.js";
import { runIndexer } from "./indexer.js";
async function main() {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.error("❌ Error: MONGO_URI environment variable is not set");
        console.error("Please create a .env file with MONGO_URI=your_mongodb_connection_string");
        process.exit(1);
    }
    await connectDB(mongoUri);
    const startHeight = Number(process.env.START_HEIGHT || 1);
    await runIndexer(startHeight);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
