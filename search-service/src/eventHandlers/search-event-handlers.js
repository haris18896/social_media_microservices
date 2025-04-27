const Search = require("../models/Search");
const logger = require("../utils/logger");

async function invalidatePostCache(postId) {
  const cachedKey = `post:${postId}`;
  await redisClient.del(cachedKey);
  const keys = await redisClient.keys("posts:*");
  if (keys.length > 0) {
    await redisClient.del(keys);
  }
}
async function handlePostCreated(event) {
  logger.info("Search Service: Handling post created event initiated...");

  try {
    const newSearchPost = new Search({
      postId: event.postId,
      userId: event.userId,
      content: event.content,
      mediaIds: event.mediaIds,
    });

    await newSearchPost.save();
    await invalidatePostCache(event.postId);

    logger.info(`Search post created : ${newSearchPost.postId} successfully`);
  } catch (error) {
    logger.error("Search Service: Error handling post created event", error);
    throw error;
  }
}

async function handlePostDeleted(event) {
  try {
    await Search.findOneAndDelete({ postId: event.postId });
    logger.info(`Search post deleted : ${event.postId} successfully`);
  } catch (error) {
    logger.error("Search Service: Error handling post deleted event", error);
    throw error;
  }
}

module.exports = {
  handlePostCreated,
  handlePostDeleted,
};
