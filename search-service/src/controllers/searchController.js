const SearchQuery = require("../models/SearchQuery");
const { natural } = require("natural");
const elasticsearchService = require("../utils/elasticsearchService");
const logger = require("../utils/logger");
const Redis = require("ioredis");

// Initialize Redis for caching if configured
const redisClient = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL)
  : null;

// TTL for cached search results (10 minutes)
const CACHE_TTL = 600;

// Initialize natural language processing tools
const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;

/**
 * Process a search query
 * @param {string} query - Raw search query
 * @returns {Object} - Processed query data
 */
const processQuery = (query) => {
  // Normalize the query
  const normalized = query.toLowerCase().trim();

  // Tokenize the query
  const tokens = tokenizer.tokenize(normalized) || [];

  // Stem each token
  const stemmed = tokens.map((token) => stemmer.stem(token));

  // Rejoin stemmed tokens
  const normalizedQuery = stemmed.join(" ");

  // Extract potential tags (words with # prefix)
  const extractedTags = tokens
    .filter((token) => token.startsWith("#"))
    .map((tag) => tag.substring(1).toLowerCase());

  return {
    query: normalized,
    normalizedQuery,
    extractedTags,
  };
};

/**
 * Track a search query for analytics
 * @param {string} query - Search query
 * @param {Object} context - Search context (filters, sorting, etc.)
 * @param {string} userId - User ID (optional)
 */
const trackSearchQuery = async (query, context, userId) => {
  try {
    if (!query) return;

    const {
      query: normalized,
      normalizedQuery,
      extractedTags,
    } = processQuery(query);

    // Try to find existing search query record
    let searchQuery = await SearchQuery.findOne({ normalizedQuery });

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (searchQuery) {
      // Update existing record
      searchQuery.count += 1;

      // Add today's count or increment if exists
      const dailyCount = searchQuery.dailyCounts.find(
        (count) => count.date.toDateString() === today.toDateString()
      );

      if (dailyCount) {
        dailyCount.count += 1;
      } else {
        searchQuery.dailyCounts.push({ date: today, count: 1 });
      }

      // Add user ID if provided and not already in the list
      if (userId && !searchQuery.userIds.includes(userId)) {
        searchQuery.userIds.push(userId);
      }

      // Add search timestamp
      searchQuery.searchTimestamps.push(now);

      // Update context
      searchQuery.context = context;

      await searchQuery.save();
    } else {
      // Create new record
      searchQuery = new SearchQuery({
        query: normalized,
        normalizedQuery,
        extractedTags,
        count: 1,
        dailyCounts: [{ date: today, count: 1 }],
        context,
        userIds: userId ? [userId] : [],
        searchTimestamps: [now],
      });

      await searchQuery.save();
    }
  } catch (error) {
    logger.error(`Error tracking search query: ${error.message}`);
    // Don't throw error to avoid affecting the search response
  }
};

/**
 * Search across all content types
 */
exports.search = async (req, res) => {
  try {
    const {
      query,
      types = "posts,users,media",
      limit = 20,
      from = 0,
      sort = "relevance",
    } = req.query;

    if (!query) {
      return res.status(400).json({ message: "Search query is required" });
    }

    // Get user ID if available
    const userId = req.user ? req.user.id : null;

    // Track search query for analytics
    trackSearchQuery(
      query,
      {
        filters: { types },
        sorting: sort,
        limit,
      },
      userId
    );

    // Check if result is cached
    const cacheKey = `search:${query}:${types}:${limit}:${from}:${sort}`;

    if (redisClient) {
      const cachedResult = await redisClient.get(cacheKey);
      if (cachedResult) {
        logger.debug(`Cache hit for search: ${cacheKey}`);
        return res.status(200).json(JSON.parse(cachedResult));
      }
    }

    // Parse requested types
    const typeArray = types.split(",").map((type) => type.trim());

    // Build search operations for multi-search
    const operations = [];
    const indicesMap = {
      posts: elasticsearchService.INDICES.POSTS,
      users: elasticsearchService.INDICES.USERS,
      media: elasticsearchService.INDICES.MEDIA,
      comments: elasticsearchService.INDICES.COMMENTS,
    };

    // Add header and body for each index to search
    typeArray.forEach((type) => {
      if (indicesMap[type]) {
        operations.push(
          { index: indicesMap[type] },
          {
            query: {
              bool: {
                must: [
                  {
                    multi_match: {
                      query,
                      fields: ["*"],
                      fuzziness: "AUTO",
                      operator: "and",
                    },
                  },
                  {
                    match: {
                      isPrivate: false,
                    },
                  },
                ],
              },
            },
            from: parseInt(from),
            size: parseInt(limit),
            sort: getSortConfig(sort, type),
          }
        );
      }
    });

    // Perform the multi-search
    const { body } = await elasticsearchService.multiSearch(operations);

    // Process results
    const results = {};
    let totalHits = 0;

    typeArray.forEach((type, index) => {
      if (indicesMap[type]) {
        const response = body.responses[index];
        results[type] = {
          total: response.hits.total.value,
          hits: response.hits.hits.map((hit) => ({
            id: hit._id,
            type,
            score: hit._score,
            ...hit._source,
          })),
        };
        totalHits += response.hits.total.value;
      }
    });

    // Add suggestions if no results found
    let suggestions = [];
    if (totalHits === 0) {
      suggestions = await getSuggestions(query);
    }

    const response = {
      query,
      total: totalHits,
      results,
      suggestions,
    };

    // Cache the result if Redis is available
    if (redisClient) {
      await redisClient.set(
        cacheKey,
        JSON.stringify(response),
        "EX",
        CACHE_TTL
      );
    }

    return res.status(200).json(response);
  } catch (error) {
    logger.error(`Search error: ${error.message}`);
    return res.status(500).json({
      message: "Error performing search",
      error: error.message,
    });
  }
};

/**
 * Get search suggestions based on a query
 * @param {string} query - Search query
 * @returns {Array} - List of suggestions
 */
const getSuggestions = async (query) => {
  try {
    // Get similar queries from search history
    const { query: normalized, normalizedQuery } = processQuery(query);

    const similarQueries = await SearchQuery.find({
      $text: { $search: normalizedQuery },
    })
      .sort({ count: -1 })
      .limit(5);

    return similarQueries.map((sq) => sq.query);
  } catch (error) {
    logger.error(`Error getting search suggestions: ${error.message}`);
    return [];
  }
};

/**
 * Get sort configuration based on sort parameter
 * @param {string} sort - Sort parameter
 * @param {string} type - Content type
 * @returns {Array} - Elasticsearch sort configuration
 */
const getSortConfig = (sort, type) => {
  switch (sort) {
    case "recent":
      return [{ createdAt: "desc" }];
    case "likes":
      return [{ likes: "desc" }];
    case "comments":
      if (type === "posts") {
        return [{ comments: "desc" }];
      }
      return [{ _score: "desc" }];
    default: // relevance
      return [{ _score: "desc" }];
  }
};

/**
 * Get trending searches
 */
exports.getTrendingSearches = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    // Check cache first
    const cacheKey = `trending:${limit}`;

    if (redisClient) {
      const cachedResult = await redisClient.get(cacheKey);
      if (cachedResult) {
        return res.status(200).json(JSON.parse(cachedResult));
      }
    }

    // Get trending searches
    const trending = await SearchQuery.find({ isTrending: true })
      .sort({ count: -1 })
      .limit(parseInt(limit));

    // If no trending searches, get most popular
    if (trending.length === 0) {
      const popular = await SearchQuery.find()
        .sort({ count: -1 })
        .limit(parseInt(limit));

      const result = {
        trending: popular.map((item) => ({
          query: item.query,
          count: item.count,
        })),
      };

      // Cache the result
      if (redisClient) {
        await redisClient.set(cacheKey, JSON.stringify(result), "EX", 3600); // 1 hour
      }

      return res.status(200).json(result);
    }

    const result = {
      trending: trending.map((item) => ({
        query: item.query,
        count: item.count,
      })),
    };

    // Cache the result
    if (redisClient) {
      await redisClient.set(cacheKey, JSON.stringify(result), "EX", 3600); // 1 hour
    }

    return res.status(200).json(result);
  } catch (error) {
    logger.error(`Error getting trending searches: ${error.message}`);
    return res.status(500).json({
      message: "Error getting trending searches",
      error: error.message,
    });
  }
};

/**
 * Track a click on a search result
 */
exports.trackSearchClick = async (req, res) => {
  try {
    const { query, resultId, resultType } = req.body;

    if (!query || !resultId || !resultType) {
      return res.status(400).json({ message: "Missing required parameters" });
    }

    const { normalizedQuery } = processQuery(query);

    // Update click count for the query
    await SearchQuery.updateOne(
      { normalizedQuery },
      { $inc: { clickCount: 1 } }
    );

    return res.status(200).json({ message: "Click tracked successfully" });
  } catch (error) {
    logger.error(`Error tracking search click: ${error.message}`);
    return res.status(500).json({
      message: "Error tracking search click",
      error: error.message,
    });
  }
};
