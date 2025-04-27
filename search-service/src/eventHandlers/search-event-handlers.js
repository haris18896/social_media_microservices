const Search = require("../models/Search");
const logger = require("../utils/logger");

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
    logger.info(`Search post created : ${newSearchPost.postId} successfully`);
  } catch (error) {
    logger.error("Search Service: Error handling post created event", error);
    throw error;
  }
}

module.exports = {
  handlePostCreated,
};
