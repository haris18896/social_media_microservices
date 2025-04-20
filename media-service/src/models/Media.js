const mongoose = require("mongoose");

const mediaSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    thumbnailUrl: {
      type: String,
      default: null,
    },
    dimensions: {
      width: Number,
      height: Number,
    },
    duration: {
      type: Number,
      default: null, // For video files, in seconds
    },
    encoding: {
      type: String,
    },
    metadata: {
      type: Map,
      of: String,
      default: new Map(),
    },
    isOptimized: {
      type: Boolean,
      default: false,
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    isTranscoded: {
      type: Boolean,
      default: false, // For videos
    },
    transcodingFormats: [
      {
        resolution: String,
        url: String,
        fileSize: Number,
      },
    ],
    tags: [String],
    category: {
      type: String,
      default: "uncategorized",
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Compound index for userId and createdAt for efficient queries
mediaSchema.index({ userId: 1, createdAt: -1 });

// Index for mimetype and category filters
mediaSchema.index({ mimeType: 1, category: 1 });

// Text index for search
mediaSchema.index({
  originalName: "text",
  tags: "text",
  category: "text",
});

const Media = mongoose.model("Media", mediaSchema);

module.exports = Media;
