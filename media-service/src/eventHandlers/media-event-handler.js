const Media = require("../models/Media");
const { deleteMediaFromCloudinary } = require("../utils/Cloudinary");
const logger = require("../utils/logger");

const handlePostDeleted = async (event) => {
  console.log(event, "EVENTHandler");

  // Check if event is a string or already an object
  const eventData = typeof event === "string" ? JSON.parse(event) : event;
  const { postId, mediaIds } = eventData;

  try {
    const mediaToDelete = await Media.find({ _id: { $in: mediaIds } });
    for (const media of mediaToDelete) {
      await deleteMediaFromCloudinary(media.publicId);
      await Media.findByIdAndDelete(media._id);

      logger.info(`Deleted media ${media._id} from post ${postId}`);
    }

    logger.info(`Deleted ${mediaToDelete.length} media from post ${postId}`);
  } catch (error) {
    logger.error("Error deleting media", error);
  }
};

module.exports = {
  handlePostDeleted,
};
