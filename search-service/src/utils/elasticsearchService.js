const { Client } = require("@elastic/elasticsearch");
const logger = require("./logger");

// Create Elasticsearch client
const client = new Client({
  node: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
  auth:
    process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD
      ? {
          username: process.env.ELASTICSEARCH_USERNAME,
          password: process.env.ELASTICSEARCH_PASSWORD,
        }
      : undefined,
  maxRetries: 5,
  requestTimeout: 60000,
  ssl: {
    rejectUnauthorized: process.env.ELASTICSEARCH_VERIFY_CERTS === "true",
  },
});

// Index names
const INDICES = {
  POSTS: "posts",
  USERS: "users",
  MEDIA: "media",
  COMMENTS: "comments",
};

/**
 * Initialize Elasticsearch indices
 */
const initializeIndices = async () => {
  try {
    logger.info("Initializing Elasticsearch indices");

    // Check if indices exist
    const postsExists = await indexExists(INDICES.POSTS);
    const usersExists = await indexExists(INDICES.USERS);
    const mediaExists = await indexExists(INDICES.MEDIA);
    const commentsExists = await indexExists(INDICES.COMMENTS);

    // Create indices if they don't exist
    if (!postsExists) {
      await createPostsIndex();
    }

    if (!usersExists) {
      await createUsersIndex();
    }

    if (!mediaExists) {
      await createMediaIndex();
    }

    if (!commentsExists) {
      await createCommentsIndex();
    }

    logger.info("Elasticsearch indices initialized successfully");
  } catch (error) {
    logger.error(`Error initializing Elasticsearch indices: ${error.message}`);
    // Don't throw error to allow server to start even if ES is not available
  }
};

/**
 * Check if index exists
 * @param {string} indexName - Name of the index to check
 * @returns {Promise<boolean>} - True if index exists
 */
const indexExists = async (indexName) => {
  try {
    const { body } = await client.indices.exists({ index: indexName });
    return body;
  } catch (error) {
    logger.error(`Error checking if index exists: ${error.message}`);
    return false;
  }
};

/**
 * Create posts index with mappings
 */
const createPostsIndex = async () => {
  try {
    await client.indices.create({
      index: INDICES.POSTS,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 1,
          analysis: {
            analyzer: {
              content_analyzer: {
                type: "custom",
                tokenizer: "standard",
                filter: ["lowercase", "stop", "snowball"],
              },
            },
          },
        },
        mappings: {
          properties: {
            id: { type: "keyword" },
            content: {
              type: "text",
              analyzer: "content_analyzer",
              fields: {
                keyword: { type: "keyword", ignore_above: 256 },
              },
            },
            userId: { type: "keyword" },
            username: { type: "keyword" },
            tags: { type: "keyword" },
            likes: { type: "integer" },
            comments: { type: "integer" },
            isPrivate: { type: "boolean" },
            createdAt: { type: "date" },
            updatedAt: { type: "date" },
          },
        },
      },
    });

    logger.info(`Created ${INDICES.POSTS} index`);
  } catch (error) {
    logger.error(`Error creating ${INDICES.POSTS} index: ${error.message}`);
    throw error;
  }
};

/**
 * Create users index with mappings
 */
const createUsersIndex = async () => {
  try {
    await client.indices.create({
      index: INDICES.USERS,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 1,
          analysis: {
            analyzer: {
              name_analyzer: {
                type: "custom",
                tokenizer: "standard",
                filter: ["lowercase", "asciifolding"],
              },
            },
          },
        },
        mappings: {
          properties: {
            id: { type: "keyword" },
            username: {
              type: "text",
              analyzer: "name_analyzer",
              fields: {
                keyword: { type: "keyword", ignore_above: 256 },
              },
            },
            email: { type: "keyword" },
            displayName: { type: "text", analyzer: "name_analyzer" },
            bio: { type: "text" },
            followers: { type: "integer" },
            following: { type: "integer" },
            createdAt: { type: "date" },
          },
        },
      },
    });

    logger.info(`Created ${INDICES.USERS} index`);
  } catch (error) {
    logger.error(`Error creating ${INDICES.USERS} index: ${error.message}`);
    throw error;
  }
};

/**
 * Create media index with mappings
 */
const createMediaIndex = async () => {
  try {
    await client.indices.create({
      index: INDICES.MEDIA,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 1,
        },
        mappings: {
          properties: {
            id: { type: "keyword" },
            fileName: { type: "keyword" },
            originalName: { type: "text" },
            userId: { type: "keyword" },
            mimeType: { type: "keyword" },
            fileSize: { type: "long" },
            tags: { type: "keyword" },
            category: { type: "keyword" },
            isPrivate: { type: "boolean" },
            createdAt: { type: "date" },
          },
        },
      },
    });

    logger.info(`Created ${INDICES.MEDIA} index`);
  } catch (error) {
    logger.error(`Error creating ${INDICES.MEDIA} index: ${error.message}`);
    throw error;
  }
};

/**
 * Create comments index with mappings
 */
const createCommentsIndex = async () => {
  try {
    await client.indices.create({
      index: INDICES.COMMENTS,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 1,
          analysis: {
            analyzer: {
              content_analyzer: {
                type: "custom",
                tokenizer: "standard",
                filter: ["lowercase", "stop", "snowball"],
              },
            },
          },
        },
        mappings: {
          properties: {
            id: { type: "keyword" },
            postId: { type: "keyword" },
            userId: { type: "keyword" },
            content: {
              type: "text",
              analyzer: "content_analyzer",
              fields: {
                keyword: { type: "keyword", ignore_above: 256 },
              },
            },
            likes: { type: "integer" },
            createdAt: { type: "date" },
            updatedAt: { type: "date" },
          },
        },
      },
    });

    logger.info(`Created ${INDICES.COMMENTS} index`);
  } catch (error) {
    logger.error(`Error creating ${INDICES.COMMENTS} index: ${error.message}`);
    throw error;
  }
};

/**
 * Index a document in Elasticsearch
 * @param {string} index - Index name
 * @param {string} id - Document ID
 * @param {Object} body - Document data
 * @returns {Promise<Object>} - Result of the index operation
 */
const indexDocument = async (index, id, body) => {
  try {
    const result = await client.index({
      index,
      id,
      body,
      refresh: true, // Make the change visible immediately
    });

    logger.debug(`Indexed document in ${index} with ID ${id}`);
    return result;
  } catch (error) {
    logger.error(`Error indexing document in ${index}: ${error.message}`);
    throw error;
  }
};

/**
 * Update a document in Elasticsearch
 * @param {string} index - Index name
 * @param {string} id - Document ID
 * @param {Object} body - Document data to update
 * @returns {Promise<Object>} - Result of the update operation
 */
const updateDocument = async (index, id, body) => {
  try {
    const result = await client.update({
      index,
      id,
      body: {
        doc: body,
        doc_as_upsert: true,
      },
      refresh: true,
    });

    logger.debug(`Updated document in ${index} with ID ${id}`);
    return result;
  } catch (error) {
    logger.error(`Error updating document in ${index}: ${error.message}`);
    throw error;
  }
};

/**
 * Delete a document from Elasticsearch
 * @param {string} index - Index name
 * @param {string} id - Document ID
 * @returns {Promise<Object>} - Result of the delete operation
 */
const deleteDocument = async (index, id) => {
  try {
    const result = await client.delete({
      index,
      id,
      refresh: true,
    });

    logger.debug(`Deleted document from ${index} with ID ${id}`);
    return result;
  } catch (error) {
    logger.error(`Error deleting document from ${index}: ${error.message}`);
    throw error;
  }
};

/**
 * Search documents in Elasticsearch
 * @param {Object} params - Search parameters
 * @returns {Promise<Object>} - Search results
 */
const search = async (params) => {
  try {
    const result = await client.search(params);
    return result;
  } catch (error) {
    logger.error(`Error searching in Elasticsearch: ${error.message}`);
    throw error;
  }
};

/**
 * Get a document by ID
 * @param {string} index - Index name
 * @param {string} id - Document ID
 * @returns {Promise<Object>} - Document data
 */
const getDocument = async (index, id) => {
  try {
    const result = await client.get({
      index,
      id,
    });

    return result;
  } catch (error) {
    if (error.meta && error.meta.statusCode === 404) {
      return null;
    }

    logger.error(`Error getting document from ${index}: ${error.message}`);
    throw error;
  }
};

/**
 * Perform a multi-search (search multiple indices)
 * @param {Array} operations - Array of search operations
 * @returns {Promise<Object>} - Multi-search results
 */
const multiSearch = async (operations) => {
  try {
    const result = await client.msearch({
      body: operations,
    });

    return result;
  } catch (error) {
    logger.error(`Error performing multi-search: ${error.message}`);
    throw error;
  }
};

/**
 * Check Elasticsearch health
 * @returns {Promise<Object>} - Elasticsearch health status
 */
const checkHealth = async () => {
  try {
    const result = await client.cluster.health();
    return result;
  } catch (error) {
    logger.error(`Error checking Elasticsearch health: ${error.message}`);
    throw error;
  }
};

module.exports = {
  client,
  INDICES,
  initializeIndices,
  indexExists,
  createPostsIndex,
  createUsersIndex,
  createMediaIndex,
  createCommentsIndex,
  indexDocument,
  updateDocument,
  deleteDocument,
  search,
  getDocument,
  multiSearch,
  checkHealth,
};
