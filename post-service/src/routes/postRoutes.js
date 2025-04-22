const express = require("express");
const {
  createPost,
  getAllPosts,
  getPost,
  deletePost,
} = require("../controllers/PostController");
const { authenticatedRequest } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(authenticatedRequest);

router.post("/create-post", createPost);
router.get("/get-all-posts", getAllPosts);
router.get("/get-post/:id", getPost);
router.delete("/delete-post/:id", deletePost);

module.exports = router;
