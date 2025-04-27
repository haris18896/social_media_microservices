const cloudinary = require("cloudinary").v2;
const logger = require("./logger");
const stream = require("stream");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadToCloudinary = async (file) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: "auto" },
      (error, result) => {
        if (error) {
          logger.error("Error during Cloudinary upload stream", error);
          reject(error);
        } else {
          resolve(result);
        }
      }
    );

    const bufferStream = new stream.PassThrough();
    bufferStream.end(file.buffer);
    bufferStream.pipe(uploadStream);

    bufferStream.on("error", (err) => {
      logger.error("Error in buffer stream during Cloudinary upload", err);
      reject(err);
    });
  });
};

const deleteMediaFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    logger.info("Media deleted successfully from cloud storage", publicId);
    return result;
  } catch (e) {
    logger.error("Error deleting media from Cloudinary", e);
    throw e;
  }
};

module.exports = {
  uploadToCloudinary,
  deleteMediaFromCloudinary,
};
