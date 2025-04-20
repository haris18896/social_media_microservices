const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    ip: {
      type: String,
      required: true,
    },
    isRevoked: {
      type: Boolean,
      default: false,
    },
    revokedReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Index for TTL (Time To Live) - automatically remove expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for faster look-ups by token
refreshTokenSchema.index({ token: 1 });

// Index for faster look-ups by user
refreshTokenSchema.index({ user: 1 });

// Index for faster queries checking for valid tokens
refreshTokenSchema.index({ user: 1, isRevoked: 1, expiresAt: 1 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
