const logger = require("../utils/logger");
const Post = require("../models/Post");

const createPost = async (req, res) => {
  try {
    const { content, mediaIds } = req.body;
    const newlyCreatedPost = new Post({
      user: req.user.userId,
      content,
      mediaIds: mediaIds || [],
    });

    await newlyCreatedPost.save();
    logger.info("Newly created post", newlyCreatedPost);
    return res.status(201).json({
      success: true,
      message: "Post created successfully",
      post: newlyCreatedPost,
    });
  } catch (error) {
    logger.error("Error creating post", error);
    return res
      .status(500)
      .json({ success: false, message: "Error creating post" });
  }
};

const getAllPosts = async (req, res) => {
  try {
  } catch (error) {
    logger.error("Error fetching posts", error);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching posts" });
  }
};

const getPost = async (req, res) => {
  try {
  } catch (error) {
    logger.error("Error fetching post", error);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching post" });
  }
};

const deletePost = async (req, res) => {
  try {
  } catch (error) {
    logger.error("Error deleting post", error);
    return res
      .status(500)
      .json({ success: false, message: "Error deleting post" });
  }
};

module.exports = {
  createPost,
  getAllPosts,
  getPost,
  deletePost,
};
