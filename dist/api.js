import express from "express";
import { BlockFee } from "./models/blockFee.js";
const app = express();
const PORT = Number(process.env.PORT) || 3000;
app.use(express.json());
async function ensureIndexes() {
    await BlockFee.collection.createIndex({ block_timestamp: 1 });
    await BlockFee.collection.createIndex({ block_height: 1 });
}
app.get("/fees", async (req, res) => {
    try {
        const { startTime, startHeight, endTime, endHeight } = req.query;
        // Build query based on provided parameters
        const query = {};
        const conditions = [];
        // Handle time-based queries (timestamp in seconds or milliseconds)
        if (startTime || endTime) {
            const timeQuery = {};
            if (startTime) {
                const timestamp = Number(startTime);
                if (isNaN(timestamp)) {
                    return res.status(400).json({
                        error: "Invalid startTime format",
                        message: "startTime must be a valid Unix timestamp (seconds or milliseconds)"
                    });
                }
                // Convert milliseconds to seconds
                timeQuery.$gte = timestamp > 1e12 ? Math.floor(timestamp / 1000) : timestamp;
            }
            if (endTime) {
                const timestamp = Number(endTime);
                if (isNaN(timestamp)) {
                    return res.status(400).json({
                        error: "Invalid endTime format",
                        message: "endTime must be a valid Unix timestamp (seconds or milliseconds)"
                    });
                }
                timeQuery.$lte = timestamp > 1e12 ? Math.floor(timestamp / 1000) : timestamp;
            }
            if (Object.keys(timeQuery).length > 0) {
                conditions.push({ block_timestamp: timeQuery });
            }
        }
        // Handle height-based queries
        if (startHeight || endHeight) {
            const heightQuery = {};
            if (startHeight)
                heightQuery.$gte = Number(startHeight);
            if (endHeight)
                heightQuery.$lte = Number(endHeight);
            if (Object.keys(heightQuery).length > 0) {
                conditions.push({ block_height: heightQuery });
            }
        }
        if (conditions.length === 1) {
            Object.assign(query, conditions[0]);
        }
        else if (conditions.length > 1) {
            query.$and = conditions;
        }
        // Single aggregation query - MongoDB handles large datasets efficiently
        // Indexes on block_timestamp and block_height ensure fast queries
        const result = await BlockFee.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalFees: { $sum: "$total_fees_stx" },
                    blockCount: { $sum: 1 }
                }
            }
        ]);
        const totalFees = result.length > 0 ? result[0].totalFees : 0;
        const blockCount = result.length > 0 ? result[0].blockCount : 0;
        res.json({
            token: "stx",
            totalFees,
            blockCount,
            query: {
                startTime: startTime || null,
                startHeight: startHeight || null,
                endTime: endTime || null,
                endHeight: endHeight || null
            }
        });
    }
    catch (error) {
        console.error("Error querying fees:", error);
        res.status(500).json({
            error: "Internal server error",
            message: error instanceof Error ? error.message : "Unknown error"
        });
    }
});
export async function startAPI() {
    await ensureIndexes();
    app.listen(PORT, () => {
        console.log(`🌐 API server running on port ${PORT}`);
        console.log(`📡 Query fees endpoint: http://localhost:${PORT}/fees`);
    });
}
