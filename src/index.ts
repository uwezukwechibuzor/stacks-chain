import "dotenv/config";
import { connectDB } from "./db.js";
import { runIndexer } from "./indexer.js";

async function main() {
  await connectDB();

  const startHeight = Number(process.env.START_HEIGHT || 1);
  await runIndexer(startHeight);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
