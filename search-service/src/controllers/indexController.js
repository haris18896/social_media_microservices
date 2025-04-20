const SearchIndex = require("../models/SearchIndex");
const elasticsearchService = require("../utils/elasticsearchService");
const logger = require("../utils/logger");
const { v4: uuidv4 } = require("uuid");

/**
 * Index a document in Elasticsearch
 */
exports.indexDocument = async (req, res) => {
  try {
    const { sourceId, sourceType, contentType, data } = req.body;

    if (!sourceId || !sourceType || !contentType || !data) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Validate source type
    const validSourceTypes = ["post", "user", "media", "comment"];
    if (!validSourceTypes.includes(sourceType)) {
      return res.status(400).json({ message: "Invalid source type" });
    }

    // Check if document already exists in index tracking
    let indexRecord = await SearchIndex.findOne({ sourceId, sourceType });

    // Generate ES document ID if new
    const esId = indexRecord ? indexRecord.esId : uuidv4();

    // Map source type to index name
    const indexMap = {
      post: elasticsearchService.INDICES.POSTS,
      user: elasticsearchService.INDICES.USERS,
      media: elasticsearchService.INDICES.MEDIA,
      comment: elasticsearchService.INDICES.COMMENTS,
    };

    const indexName = indexMap[sourceType];

    // Prepare document for indexing (ensure it has an id field)
    const document = {
      ...data,
      id: sourceId,
    };

    if (indexRecord) {
      // Update existing document
      await elasticsearchService.updateDocument(indexName, esId, document);

      // Update index tracking record
      indexRecord.status = "indexed";
      indexRecord.contentType = contentType;
      indexRecord.version += 1;
      indexRecord.lastIndexed = new Date();
      indexRecord.snapshot = createSnapshot(data);

      await indexRecord.save();

      logger.info(
        `Updated document in Elasticsearch: ${sourceType}/${sourceId}`
      );
    } else {
      // Index new document
      await elasticsearchService.indexDocument(indexName, esId, document);

      // Create index tracking record
      indexRecord = new SearchIndex({
        sourceId,
        sourceType,
        contentType,
        esId,
        status: "indexed",
        snapshot: createSnapshot(data),
      });

      await indexRecord.save();

      logger.info(
        `Indexed new document in Elasticsearch: ${sourceType}/${sourceId}`
      );
    }

    return res.status(200).json({
      message: "Document indexed successfully",
      esId,
      sourceId,
      sourceType,
    });
  } catch (error) {
    logger.error(`Error indexing document: ${error.message}`);
    return res.status(500).json({
      message: "Failed to index document",
      error: error.message,
    });
  }
};

/**
 * Delete a document from Elasticsearch
 */
exports.deleteDocument = async (req, res) => {
  try {
    const { sourceId, sourceType, permanent = false } = req.body;

    if (!sourceId || !sourceType) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Find the index record
    const indexRecord = await SearchIndex.findOne({ sourceId, sourceType });

    if (!indexRecord) {
      return res
        .status(404)
        .json({ message: "Document not found in search index" });
    }

    // Map source type to index name
    const indexMap = {
      post: elasticsearchService.INDICES.POSTS,
      user: elasticsearchService.INDICES.USERS,
      media: elasticsearchService.INDICES.MEDIA,
      comment: elasticsearchService.INDICES.COMMENTS,
    };

    const indexName = indexMap[sourceType];

    if (permanent) {
      // Permanently delete from Elasticsearch
      await elasticsearchService.deleteDocument(indexName, indexRecord.esId);

      // Delete the tracking record
      await SearchIndex.deleteOne({ _id: indexRecord._id });

      logger.info(
        `Permanently deleted document from Elasticsearch: ${sourceType}/${sourceId}`
      );
    } else {
      // Soft delete (mark as inactive) but keep the document
      indexRecord.isActive = false;
      indexRecord.status = "deleted";
      await indexRecord.save();

      // Update document in Elasticsearch to mark as deleted
      await elasticsearchService.updateDocument(indexName, indexRecord.esId, {
        isDeleted: true,
        isActive: false,
      });

      logger.info(
        `Soft deleted document in Elasticsearch: ${sourceType}/${sourceId}`
      );
    }

    return res.status(200).json({
      message: "Document deleted successfully",
      permanent,
    });
  } catch (error) {
    logger.error(`Error deleting document: ${error.message}`);
    return res.status(500).json({
      message: "Failed to delete document",
      error: error.message,
    });
  }
};

/**
 * Batch index multiple documents
 */
exports.batchIndex = async (req, res) => {
  try {
    const { documents } = req.body;

    if (!Array.isArray(documents) || documents.length === 0) {
      return res
        .status(400)
        .json({ message: "Invalid or empty documents array" });
    }

    const results = {
      total: documents.length,
      successful: 0,
      failed: 0,
      errors: [],
    };

    for (const doc of documents) {
      try {
        const { sourceId, sourceType, contentType, data } = doc;

        if (!sourceId || !sourceType || !contentType || !data) {
          results.failed++;
          results.errors.push({
            sourceId,
            sourceType,
            error: "Missing required fields",
          });
          continue;
        }

        // Check if document already exists
        let indexRecord = await SearchIndex.findOne({ sourceId, sourceType });

        // Generate ES document ID if new
        const esId = indexRecord ? indexRecord.esId : uuidv4();

        // Map source type to index name
        const indexMap = {
          post: elasticsearchService.INDICES.POSTS,
          user: elasticsearchService.INDICES.USERS,
          media: elasticsearchService.INDICES.MEDIA,
          comment: elasticsearchService.INDICES.COMMENTS,
        };

        const indexName = indexMap[sourceType];

        // Prepare document for indexing
        const document = {
          ...data,
          id: sourceId,
        };

        // Index document
        await elasticsearchService.updateDocument(indexName, esId, document);

        if (indexRecord) {
          // Update existing record
          indexRecord.status = "indexed";
          indexRecord.contentType = contentType;
          indexRecord.version += 1;
          indexRecord.lastIndexed = new Date();
          indexRecord.snapshot = createSnapshot(data);

          await indexRecord.save();
        } else {
          // Create new record
          indexRecord = new SearchIndex({
            sourceId,
            sourceType,
            contentType,
            esId,
            status: "indexed",
            snapshot: createSnapshot(data),
          });

          await indexRecord.save();
        }

        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          sourceId: doc.sourceId,
          sourceType: doc.sourceType,
          error: error.message,
        });
        logger.error(
          `Error in batch indexing document ${doc.sourceId}: ${error.message}`
        );
      }
    }

    logger.info(
      `Batch indexing completed: ${results.successful} successful, ${results.failed} failed`
    );
    return res.status(200).json(results);
  } catch (error) {
    logger.error(`Error in batch indexing: ${error.message}`);
    return res.status(500).json({
      message: "Failed to process batch indexing",
      error: error.message,
    });
  }
};

/**
 * Get indexing status for a document
 */
exports.getIndexStatus = async (req, res) => {
  try {
    const { sourceId, sourceType } = req.params;

    if (!sourceId || !sourceType) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const indexRecord = await SearchIndex.findOne({ sourceId, sourceType });

    if (!indexRecord) {
      return res
        .status(404)
        .json({ message: "Document not found in search index" });
    }

    return res.status(200).json({
      sourceId: indexRecord.sourceId,
      sourceType: indexRecord.sourceType,
      contentType: indexRecord.contentType,
      status: indexRecord.status,
      isActive: indexRecord.isActive,
      lastIndexed: indexRecord.lastIndexed,
      version: indexRecord.version,
    });
  } catch (error) {
    logger.error(`Error getting index status: ${error.message}`);
    return res.status(500).json({
      message: "Failed to get index status",
      error: error.message,
    });
  }
};

/**
 * Reindex all documents of a specific type
 */
exports.reindexAll = async (req, res) => {
  try {
    const { sourceType } = req.params;

    if (!sourceType) {
      return res.status(400).json({ message: "Source type is required" });
    }

    // This would typically be a background job
    // For simplicity, we'll just start the process and return success

    // Update all records of this type to 'pending' status
    await SearchIndex.updateMany({ sourceType }, { status: "pending" });

    // Start the reindexing process in the background
    reindexDocuments(sourceType).catch((err) => {
      logger.error(`Background reindexing error: ${err.message}`);
    });

    return res.status(202).json({
      message: `Reindexing of ${sourceType} documents started`,
      sourceType,
    });
  } catch (error) {
    logger.error(`Error starting reindex: ${error.message}`);
    return res.status(500).json({
      message: "Failed to start reindexing",
      error: error.message,
    });
  }
};

/**
 * Background reindexing process
 * @param {string} sourceType - Type of documents to reindex
 */
const reindexDocuments = async (sourceType) => {
  logger.info(`Starting reindexing for ${sourceType} documents`);

  try {
    // Get all documents needing reindexing
    const documents = await SearchIndex.find({
      sourceType,
      status: "pending",
    }).limit(1000); // Process in batches

    logger.info(`Found ${documents.length} ${sourceType} documents to reindex`);

    // Map source type to index name
    const indexMap = {
      post: elasticsearchService.INDICES.POSTS,
      user: elasticsearchService.INDICES.USERS,
      media: elasticsearchService.INDICES.MEDIA,
      comment: elasticsearchService.INDICES.COMMENTS,
    };

    const indexName = indexMap[sourceType];

    let successful = 0;
    let failed = 0;

    for (const doc of documents) {
      try {
        // Typically you would fetch fresh data from the source service
        // Here we'll just use the snapshot data for simplicity
        if (!doc.snapshot) {
          logger.warn(
            `No snapshot data for ${sourceType}/${doc.sourceId}, skipping`
          );
          continue;
        }

        // Reindex document
        await elasticsearchService.updateDocument(indexName, doc.esId, {
          ...doc.snapshot,
          id: doc.sourceId,
        });

        // Update status
        doc.status = "indexed";
        doc.lastIndexed = new Date();
        doc.version += 1;
        await doc.save();

        successful++;
      } catch (error) {
        // Mark as failed
        doc.status = "failed";
        doc.error = error.message;
        await doc.save();

        failed++;
        logger.error(
          `Failed to reindex ${sourceType}/${doc.sourceId}: ${error.message}`
        );
      }
    }

    logger.info(
      `Reindexing completed for ${sourceType}: ${successful} successful, ${failed} failed`
    );
  } catch (error) {
    logger.error(
      `Error in reindexing ${sourceType} documents: ${error.message}`
    );
  }
};

/**
 * Create a snapshot of document data for tracking
 * @param {Object} data - Document data
 * @returns {Object} - Snapshot with essential fields
 */
const createSnapshot = (data) => {
  // Extract essential fields for snapshot
  const snapshot = {
    title: data.title || data.name || data.username || null,
    content: data.content || data.description || data.bio || null,
    userId: data.userId || null,
    username: data.username || null,
    tags: data.tags || [],
    category: data.category || null,
    createdAt: data.createdAt || new Date(),
    updatedAt: data.updatedAt || new Date(),
  };

  return snapshot;
};
