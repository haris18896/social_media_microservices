const logger = require("../utils/logger");
const Post = require("../models/Post");
const { validationCreatePost } = require("../utils/validation");
const Redis = require("ioredis");

const redisClient = new Redis(process.env.REDIS_URL);

async function invalidatePostCache(req, input) {
  const cachedKey = `post:${input}`;
  await req.redisClient.del(cachedKey);
  const keys = await req.redisClient.keys("posts:*");
  if (keys.length > 0) {
    await req.redisClient.del(keys);
  }
}

const createPost = async (req, res) => {
  try {
    const { error } = validationCreatePost(req.body);
    if (error) {
      logger.warn("Validation error : ", error.details[0].message);
      return res
        .status(400)
        .json({ success: false, message: error.details[0].message });
    }
    const { content, mediaIds } = req.body;

    const newlyCreatedPost = new Post({
      user: req.user,
      content,
      mediaIds: mediaIds || [],
    });

    await newlyCreatedPost.save();
    await invalidatePostCache(req, newlyCreatedPost?._id.toString());
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const startLimit = (page - 1) * limit;

    // cache key
    const cacheKey = `posts:${page}:${limit}`;
    const cachedPosts = await redisClient.get(cacheKey);

    if (cachedPosts) {
      return res.status(200).json({
        success: true,
        message: "Posts fetched successfully",
        posts: cachedPosts,
      });
    }

    const posts = await Post.find({ user: req.user })
      .sort({ createdAt: -1 })
      .skip(startLimit)
      .limit(limit);

    const totalNoOfPosts = await Post.countDocuments();

    const result = {
      posts,
      currentPage: page,
      totalPages: Math.ceil(totalNoOfPosts / limit),
      totalNoOfPosts,
    };

    // save your posts in redis cache
    await req.redisClient.setex(cacheKey, 300, JSON.stringify(result));

    return res.status(200).json({
      success: true,
      message: "Posts fetched successfully",
      posts: JSON.stringify(result),
    });
  } catch (error) {
    logger.error("Error fetching posts", error);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching posts" });
  }
};

const getPost = async (req, res) => {
  try {
    const postId = req.params.id;
    const cachekey = `post:${postId}`;
    const cachedPost = await req.redisClient.get(cachekey);

    if (cachedPost) {
      return res.json(JSON.parse(cachedPost));
    }

    const singlePostDetailsById = await Post.findById(postId);

    if (!singlePostDetailsById) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    await req.redisClient.setex(
      cachekey,
      300,
      JSON.stringify(singlePostDetailsById)
    );

    return res.json({
      success: true,
      message: "Post fetched successfully",
      post: singlePostDetailsById,
    });
  } catch (error) {
    logger.error("Error fetching post", error);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching post" });
  }
};

const deletePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const post = await Post.findOneAndDelete({
      _id: postId,
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    await invalidatePostCache(req, postId);

    return res.json({
      success: true,
      message: "Post deleted successfully",
    });
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
