const Search = require("../models/Search");
const logger = require("../utils/logger");
const Redis = require("ioredis");

const redisClient = new Redis(process.env.REDIS_URL);

const searchPostController = async (req, res) => {
  logger.info("Searching for posts");

  try {
    const { query } = req.query;

    const cachedKey = `search:${query}`;
    const cachedPosts = await redisClient.get(cachedKey);

    if (cachedPosts) {
      return res.status(200).json({
        success: true,
        message: "Posts fetched successfully",
        posts: JSON.parse(cachedPosts),
      });
    }

    const result = await Search.find(
      {
        $text: {
          $search: query,
          $caseSensitive: false,
          $diacriticSensitive: false,
        },
      },
      {
        score: { $meta: "textScore" },
      }
    )
      .sort({ score: { $meta: "textScore" } })
      .limit(10);

    await redisClient.setex(cachedKey, 300, JSON.stringify(result));

    res.status(200).json({
      success: true,
      message: "Posts fetched successfully",
      posts: result,
    });
  } catch (e) {
    logger.error("Error while searching post", e);
    res.status(500).json({ message: "Error while searching post" });
  }
};

module.exports = {
  searchPostController,
};
