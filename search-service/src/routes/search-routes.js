const express = require("express");
const { searchPostController } = require("../controllers/serach-controller");
const { authenticatedRequest } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authenticatedRequest);

router.get("/posts", searchPostController);

module.exports = router;
