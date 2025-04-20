const express = require("express");
const router = express.Router();
const postController = require("../controllers/postController");

// Create a new post
router.post("/", postController.createPost);

// Get all posts by user ID - this must come before /:id route
router.get("/user/:userId", postController.getPostsByUserId);

// Get a post by ID
router.get("/:id", postController.getPostById);

// Update a post
router.put("/:id", postController.updatePost);

// Delete a post
router.delete("/:id", postController.deletePost);

// Like a post
router.post("/:id/like", postController.likePost);

module.exports = router;
