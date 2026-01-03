import mongoose from "mongoose";

const BlockFeeSchema = new mongoose.Schema(
  {
    block_height: { type: Number, unique: true, index: true },
    block_timestamp: Number,
    total_fees_stx: Number
  },
  { timestamps: true }
);

const collectionName = process.env.Fees_COLLECTION || "stacks-fees";

export const BlockFee =
  mongoose.models[collectionName] ||
  mongoose.model("BlockFee", BlockFeeSchema, collectionName);
