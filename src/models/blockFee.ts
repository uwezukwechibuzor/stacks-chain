import mongoose from "mongoose";

const BlockFeeSchema = new mongoose.Schema(
  {
    block_height: { type: Number, unique: true, index: true },
    block_timestamp: Number,
    total_fees_stx: Number
  },
  { timestamps: true }
);

export const BlockFee =
  mongoose.models.BlockFee ||
  mongoose.model("BlockFee", BlockFeeSchema);
