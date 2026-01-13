import mongoose from "mongoose";

const FailedBlockSchema = new mongoose.Schema(
  {
    block_height: { type: Number, unique: true, index: true },
    error_message: String,
    failed_at: { type: Date, default: Date.now },
    retry_count: { type: Number, default: 0 }
  },
  { timestamps: true }
);

const collectionName = process.env.FAILED_BLOCKS_COLLECTION || "stacks-failed-blocks";

export const FailedBlock =
  mongoose.models[collectionName] ||
  mongoose.model("FailedBlock", FailedBlockSchema, collectionName);

