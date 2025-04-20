const mongoose = require("mongoose");

/**
 * Schema for tracking indexed documents and their status
 */
const searchIndexSchema = new mongoose.Schema(
  {
    // Original document ID from source service
    sourceId: {
      type: String,
      required: true,
      index: true,
    },
    // Service where original document is stored (post, user, media, etc.)
    sourceType: {
      type: String,
      required: true,
      enum: ["post", "user", "media", "comment"],
      index: true,
    },
    // Content type for filtering (text, image, video, profile, etc.)
    contentType: {
      type: String,
      required: true,
      index: true,
    },
    // Elasticsearch document ID
    esId: {
      type: String,
      required: true,
      unique: true,
    },
    // Indexing status
    status: {
      type: String,
      enum: ["pending", "indexed", "failed", "updating", "deleting", "deleted"],
      default: "pending",
      index: true,
    },
    // Error message if indexing failed
    error: {
      type: String,
      default: null,
    },
    // Last time document was indexed or attempted
    lastIndexed: {
      type: Date,
      default: Date.now,
    },
    // Index version for tracking updates
    version: {
      type: Number,
      default: 1,
    },
    // Whether document is available in search results
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    // Original document data snapshot for quick reference
    snapshot: {
      title: String,
      content: String,
      userId: String,
      username: String,
      tags: [String],
      category: String,
      createdAt: Date,
      updatedAt: Date,
    },
  },
  { timestamps: true }
);

// Create compound indexes for efficient queries
searchIndexSchema.index({ sourceType: 1, status: 1 });
searchIndexSchema.index({ sourceType: 1, sourceId: 1 }, { unique: true });
searchIndexSchema.index({ createdAt: -1 });

const SearchIndex = mongoose.model("SearchIndex", searchIndexSchema);

module.exports = SearchIndex;
