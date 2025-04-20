const express = require("express");
const router = express.Router();
const searchController = require("../controllers/searchController");
const indexController = require("../controllers/indexController");
const verifyToken = require("../middleware/verifyToken");

// Public search routes
router.get("/search", searchController.search);
router.get("/trending", searchController.getTrendingSearches);

// Protected search routes (require authentication)
router.use("/analytics", verifyToken);
router.post("/analytics/click", searchController.trackSearchClick);

// Index management routes (require authentication)
router.use("/index", verifyToken);
router.post("/index/document", indexController.indexDocument);
router.delete("/index/document", indexController.deleteDocument);
router.post("/index/batch", indexController.batchIndex);
router.get(
  "/index/status/:sourceType/:sourceId",
  indexController.getIndexStatus
);
router.post("/index/reindex/:sourceType", indexController.reindexAll);

module.exports = router;
