const Post = require("../models/Post");
const logger = require("../utils/logger");

// Create a new post
exports.createPost = async (req, res) => {
  try {
    const { userId, content, mediaUrls, tags, isPrivate } = req.body;

    if (!userId || !content) {
      return res
        .status(400)
        .json({ message: "userId and content are required fields" });
    }

    const newPost = new Post({
      userId,
      content,
      mediaUrls: mediaUrls || [],
      tags: tags || [],
      isPrivate: isPrivate || false,
    });

    const savedPost = await newPost.save();

    logger.info(`Post created successfully with ID: ${savedPost.id}`);
    return res.status(201).json(savedPost);
  } catch (error) {
    logger.error(`Error creating post: ${error.message}`);
    return res
      .status(500)
      .json({ message: "Failed to create post", error: error.message });
  }
};

// Get a post by ID
exports.getPostById = async (req, res) => {
  try {
    const { id } = req.params;

    const post = await Post.findById(id);

    if (!post || post.isDeleted) {
      return res.status(404).json({ message: "Post not found" });
    }

    return res.status(200).json(post);
  } catch (error) {
    logger.error(`Error fetching post: ${error.message}`);
    return res
      .status(500)
      .json({ message: "Failed to fetch post", error: error.message });
  }
};

// Get all posts by user ID
exports.getPostsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10, skip = 0 } = req.query;

    const posts = await Post.find({
      userId,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Post.countDocuments({ userId, isDeleted: false });

    return res.status(200).json({
      posts,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
      },
    });
  } catch (error) {
    logger.error(`Error fetching user posts: ${error.message}`);
    return res
      .status(500)
      .json({ message: "Failed to fetch user posts", error: error.message });
  }
};

// Update a post
exports.updatePost = async (req, res) => {
  try {
    const { id } = req.params;
    const { content, mediaUrls, tags, isPrivate } = req.body;

    const post = await Post.findById(id);

    if (!post || post.isDeleted) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check if user owns the post (in a real app, would verify against auth token)
    if (post.userId !== req.body.userId) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this post" });
    }

    const updatedPost = await Post.findByIdAndUpdate(
      id,
      {
        content: content || post.content,
        mediaUrls: mediaUrls || post.mediaUrls,
        tags: tags || post.tags,
        isPrivate: isPrivate !== undefined ? isPrivate : post.isPrivate,
      },
      { new: true }
    );

    logger.info(`Post updated successfully with ID: ${id}`);
    return res.status(200).json(updatedPost);
  } catch (error) {
    logger.error(`Error updating post: ${error.message}`);
    return res
      .status(500)
      .json({ message: "Failed to update post", error: error.message });
  }
};

// Delete a post (soft delete)
exports.deletePost = async (req, res) => {
  try {
    const { id } = req.params;

    const post = await Post.findById(id);

    if (!post || post.isDeleted) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check if user owns the post (in a real app, would verify against auth token)
    if (post.userId !== req.body.userId) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this post" });
    }

    await Post.findByIdAndUpdate(id, { isDeleted: true });

    logger.info(`Post soft deleted with ID: ${id}`);
    return res.status(200).json({ message: "Post deleted successfully" });
  } catch (error) {
    logger.error(`Error deleting post: ${error.message}`);
    return res
      .status(500)
      .json({ message: "Failed to delete post", error: error.message });
  }
};

// Like a post
exports.likePost = async (req, res) => {
  try {
    const { id } = req.params;

    const post = await Post.findById(id);

    if (!post || post.isDeleted) {
      return res.status(404).json({ message: "Post not found" });
    }

    const updatedPost = await Post.findByIdAndUpdate(
      id,
      { $inc: { likes: 1 } },
      { new: true }
    );

    return res.status(200).json({ likes: updatedPost.likes });
  } catch (error) {
    logger.error(`Error liking post: ${error.message}`);
    return res
      .status(500)
      .json({ message: "Failed to like post", error: error.message });
  }
};
