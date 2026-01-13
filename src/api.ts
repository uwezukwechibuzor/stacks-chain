import express from "express";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import { BlockFee } from "./models/blockFee.js";

const app = express();
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Swagger configuration
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Stacks Fee Indexer API",
      version: "1.0.0",
      description: "API for querying Stacks blockchain fee data aggregated by block height and timestamp",
      contact: {
        name: "API Support",
      },
    },
    servers: [
      {
        url: `http://${HOST}:${PORT}`,
        description: "Development server",
      },
    ],
  },
  apis: ["./src/api.ts"], // Path to the API files
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Swagger UI endpoint
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

interface QueryParams {
  startTime?: string;
  startHeight?: string;
  endTime?: string;
  endHeight?: string;
}

async function ensureIndexes() {
  await BlockFee.collection.createIndex({ block_timestamp: 1 });
  await BlockFee.collection.createIndex({ block_height: 1 });
}

/**
 * @swagger
 * /fees:
 *   get:
 *     summary: Query total fees aggregated by block height and/or timestamp
 *     description: Returns aggregated fee data (total fees and block count) filtered by optional time and height ranges
 *     tags:
 *       - Fees
 *     parameters:
 *       - in: query
 *         name: startTime
 *         schema:
 *           type: string
 *         description: Start timestamp (Unix timestamp in seconds or milliseconds)
 *         example: "1704326400"
 *       - in: query
 *         name: endTime
 *         schema:
 *           type: string
 *         description: End timestamp (Unix timestamp in seconds or milliseconds)
 *         example: "1767559976"
 *       - in: query
 *         name: startHeight
 *         schema:
 *           type: string
 *         description: Start block height (inclusive)
 *         example: ""
 *       - in: query
 *         name: endHeight
 *         schema:
 *           type: string
 *         description: End block height (inclusive)
 *         example: ""
 *     responses:
 *       200:
 *         description: Successful response with aggregated fee data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   example: "stx"
 *                   description: Token symbol
 *                 totalFees:
 *                   type: number
 *                   example: 1234.567
 *                   description: Total fees in STX
 *                 blockCount:
 *                   type: number
 *                   example: 100
 *                   description: Number of blocks in the query result
 *                 query:
 *                   type: object
 *                   properties:
 *                     startTime:
 *                       type: string
 *                       nullable: true
 *                     startHeight:
 *                       type: string
 *                       nullable: true
 *                     endTime:
 *                       type: string
 *                       nullable: true
 *                     endHeight:
 *                       type: string
 *                       nullable: true
 *       400:
 *         description: Bad request - invalid parameter format
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid startTime format"
 *                 message:
 *                   type: string
 *                   example: "startTime must be a valid Unix timestamp (seconds or milliseconds)"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 *                 message:
 *                   type: string
 *                   example: "Error message details"
 */
app.get("/fees", async (req, res) => {
  try {
    const { startTime, startHeight, endTime, endHeight } = req.query as QueryParams;

    // Build query based on provided parameters
    const query: any = {};
    const conditions: any[] = [];

    // Handle time-based queries (timestamp in seconds or milliseconds)
    if (startTime || endTime) {
      const timeQuery: any = {};
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
      const heightQuery: any = {};
      if (startHeight) heightQuery.$gte = Number(startHeight);
      if (endHeight) heightQuery.$lte = Number(endHeight);
      if (Object.keys(heightQuery).length > 0) {
        conditions.push({ block_height: heightQuery });
      }
    }

    if (conditions.length === 1) {
      Object.assign(query, conditions[0]);
    } else if (conditions.length > 1) {
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
  } catch (error) {
    console.error("Error querying fees:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

export async function startAPI() {
  await ensureIndexes();
  app.listen(PORT, HOST, () => {
    console.log(`🌐 API server running on ${HOST}:${PORT}`);
    console.log(`📚 Swagger documentation: http://${HOST}:${PORT}/api-docs`);
  });
}
