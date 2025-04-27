const Media = require("../models/Media");
const { uploadToCloudinary } = require("../utils/Cloudinary");
const logger = require("../utils/logger");

const uploadMedia = async (req, res) => {
  logger.info("Starting media upload");
  try {
    const file = req.file;
    if (!file) {
      logger.warn("No file provided in req.file");
      return res.status(400).json({
        success: false,
        message: "No file provided. Please add a file and try again",
      });
    }

    const { originalname, mimetype } = file;
    const userId = req.user;

    logger.info(`File details : name: ${originalname}, type: ${mimetype}`);
    logger.info(`Uploading file to cloudinary for user ${userId}`);

    const cloudinaryUploadResult = await uploadToCloudinary(file);
    logger.info(
      `Cloudinary upload successful. Public ID : - ${cloudinaryUploadResult.public_id}`
    );

    const newlyCreatedMedia = new Media({
      publicId: cloudinaryUploadResult.public_id,
      originalName: originalname,
      mimeType: mimetype,
      url: cloudinaryUploadResult.secure_url,
      userId,
    });

    await newlyCreatedMedia.save();

    logger.info(
      `Media uploaded successfully. Media ID : ${newlyCreatedMedia._id}`
    );
    return res.status(201).json({
      success: true,
      message: "Media uploaded successfully",
      mediaID: newlyCreatedMedia._id,
      url: newlyCreatedMedia.url,
    });
  } catch (error) {
    console.log(
      "cloudinary credentials : ",
      process.env.CLOUDINARY_CLOUD_NAME,
      process.env.CLOUDINARY_API_KEY,
      process.env.CLOUDINARY_API_SECRET
    );
    logger.error("Error uploading media", error);
    return res.status(500).json({
      success: false,
      message: "Error uploading media",
    });
  }
};

const getAllMedia = async (req, res) => {
  try {
    const media = await Media.find();
    return res.status(200).json({
      success: true,
      message: "Media fetched successfully",
      media,
    });
  } catch (error) {
    logger.error("Error fetching media", error);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching media" });
  }
};

module.exports = {
  uploadMedia,
  getAllMedia,
};
