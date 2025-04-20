const mongoose = require("mongoose");

/**
 * Schema for tracking search queries and their popularity
 */
const searchQuerySchema = new mongoose.Schema(
  {
    // The search query text
    query: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    // Normalized version of the query (stemming, stop words removed)
    normalizedQuery: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    // Frequency of the search
    count: {
      type: Number,
      default: 1,
      min: 0,
    },
    // Count of clicks from this search query
    clickCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Latest search context (filters applied)
    context: {
      filters: Map,
      sorting: String,
      limit: Number,
    },
    // User IDs who searched this query (limited to 100 most recent)
    userIds: [
      {
        type: String,
        index: true,
      },
    ],
    // Timestamps of recent searches
    searchTimestamps: [
      {
        type: Date,
        default: Date.now,
      },
    ],
    // Tags automatically extracted from the query
    extractedTags: [
      {
        type: String,
        index: true,
      },
    ],
    // Flag if this query is trending
    isTrending: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Daily/weekly/monthly search counts for trend analysis
    dailyCounts: [
      {
        date: {
          type: Date,
          required: true,
        },
        count: {
          type: Number,
          default: 0,
        },
      },
    ],
    // Suggested corrections if the query has typos
    suggestedCorrections: [
      {
        correctedQuery: String,
        confidence: Number,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Max number of user IDs to store per query
const MAX_USER_IDS = 100;

// Max number of timestamps to store per query
const MAX_TIMESTAMPS = 100;

// Pre-save hook to limit array sizes
searchQuerySchema.pre("save", function (next) {
  // Limit userIds array size
  if (this.userIds && this.userIds.length > MAX_USER_IDS) {
    this.userIds = this.userIds.slice(-MAX_USER_IDS);
  }

  // Limit searchTimestamps array size
  if (this.searchTimestamps && this.searchTimestamps.length > MAX_TIMESTAMPS) {
    this.searchTimestamps = this.searchTimestamps.slice(-MAX_TIMESTAMPS);
  }

  // Limit dailyCounts to last 90 days
  if (this.dailyCounts && this.dailyCounts.length > 90) {
    this.dailyCounts = this.dailyCounts.slice(-90);
  }

  next();
});

// Compound indexes for efficient query analysis
searchQuerySchema.index({ query: 1, createdAt: -1 });
searchQuerySchema.index({ isTrending: 1, count: -1 });
searchQuerySchema.index(
  {
    normalizedQuery: "text",
    extractedTags: "text",
  },
  {
    weights: {
      normalizedQuery: 10,
      extractedTags: 5,
    },
  }
);

const SearchQuery = mongoose.model("SearchQuery", searchQuerySchema);

module.exports = SearchQuery;
