const Media = require("../models/Media");
const logger = require("../utils/logger");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");
const AWS = require("aws-sdk");
const fileType = require("file-type");
const exifParser = require("exif-parser");
const ffmpeg = require("fluent-ffmpeg");

// Initialize AWS S3
const s3 = process.env.AWS_S3_BUCKET
  ? new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || "us-east-1",
    })
  : null;

// Configuration
const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads");
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "10485760"); // 10MB default
const ALLOWED_MIME_TYPES = {
  "image/jpeg": true,
  "image/png": true,
  "image/gif": true,
  "image/webp": true,
  "video/mp4": true,
  "video/quicktime": true,
  "audio/mpeg": true,
  "audio/wav": true,
};

// Create directory if it doesn't exist
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Upload a new media file
 */
exports.uploadMedia = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Validate file
    const file = req.file;
    if (file.size > MAX_FILE_SIZE) {
      return res.status(400).json({
        message: `File size exceeds maximum limit of ${MAX_FILE_SIZE / 1048576}MB`,
      });
    }

    const detectedType = await fileType.fromBuffer(file.buffer);
    if (!detectedType || !ALLOWED_MIME_TYPES[detectedType.mime]) {
      return res.status(400).json({ message: "File type not allowed" });
    }

    // Check user ID
    const userId = req.body.userId || (req.user && req.user.id);
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // Generate unique filename
    const fileId = uuidv4();
    const extension = path.extname(file.originalname) || `.${detectedType.ext}`;
    const fileName = `${fileId}${extension}`;
    const filePath = path.join(UPLOAD_DIR, fileName);

    // Extract metadata
    const metadata = new Map();
    let dimensions = {};
    let duration = null;

    // Process based on file type
    if (detectedType.mime.startsWith("image/")) {
      // Process image
      try {
        // Extract EXIF data (for JPEG)
        if (detectedType.mime === "image/jpeg") {
          const exifData = exifParser.create(file.buffer).parse();

          // Store relevant EXIF data but exclude potentially sensitive information
          if (exifData.tags) {
            const safeTags = {
              Make: exifData.tags.Make,
              Model: exifData.tags.Model,
              Orientation: exifData.tags.Orientation,
              ExposureTime: exifData.tags.ExposureTime,
              FNumber: exifData.tags.FNumber,
              ISO: exifData.tags.ISO,
              DateTimeOriginal: exifData.tags.DateTimeOriginal,
              FocalLength: exifData.tags.FocalLength,
            };

            Object.entries(safeTags).forEach(([key, value]) => {
              if (value) metadata.set(key, String(value));
            });
          }
        }

        // Get image dimensions and optimize the image
        const imageInfo = await sharp(file.buffer).metadata();
        dimensions = {
          width: imageInfo.width,
          height: imageInfo.height,
        };

        // Create thumbnail (resized version)
        const thumbnailBuffer = await sharp(file.buffer)
          .resize(300, 300, { fit: "inside" })
          .toBuffer();

        // Save thumbnail
        const thumbnailFileName = `thumb_${fileName}`;
        const thumbnailPath = path.join(UPLOAD_DIR, thumbnailFileName);
        fs.writeFileSync(thumbnailPath, thumbnailBuffer);

        // Optimize original image if it's large
        if (imageInfo.width > 1920 || imageInfo.height > 1080) {
          const optimizedBuffer = await sharp(file.buffer)
            .resize(1920, 1080, { fit: "inside", withoutEnlargement: true })
            .toBuffer();

          fs.writeFileSync(filePath, optimizedBuffer);
        } else {
          fs.writeFileSync(filePath, file.buffer);
        }

        // Store in S3 if configured
        let fileUrl = `/uploads/${fileName}`;
        let thumbnailUrl = `/uploads/${thumbnailFileName}`;

        if (s3) {
          await s3
            .upload({
              Bucket: process.env.AWS_S3_BUCKET,
              Key: fileName,
              Body: fs.readFileSync(filePath),
              ContentType: detectedType.mime,
              ACL: "public-read",
            })
            .promise();

          await s3
            .upload({
              Bucket: process.env.AWS_S3_BUCKET,
              Key: thumbnailFileName,
              Body: fs.readFileSync(thumbnailPath),
              ContentType: detectedType.mime,
              ACL: "public-read",
            })
            .promise();

          fileUrl = `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${fileName}`;
          thumbnailUrl = `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${thumbnailFileName}`;

          // Clean up local files after S3 upload
          fs.unlinkSync(filePath);
          fs.unlinkSync(thumbnailPath);
        }

        // Create media record
        const media = new Media({
          userId,
          fileName,
          originalName: file.originalname,
          mimeType: detectedType.mime,
          fileSize: file.size,
          fileUrl,
          thumbnailUrl,
          dimensions,
          metadata,
          isOptimized: true,
          tags: req.body.tags
            ? req.body.tags.split(",").map((tag) => tag.trim())
            : [],
          category: req.body.category || "image",
        });

        await media.save();
        logger.info(`Image uploaded successfully: ${fileName}`);
        return res.status(201).json(media);
      } catch (error) {
        logger.error(`Error processing image: ${error.message}`);
        return res
          .status(500)
          .json({ message: "Error processing image", error: error.message });
      }
    } else if (detectedType.mime.startsWith("video/")) {
      // Save video file for processing
      fs.writeFileSync(filePath, file.buffer);

      // Store video with basic info first
      let fileUrl = `/uploads/${fileName}`;

      if (s3) {
        await s3
          .upload({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: fileName,
            Body: fs.readFileSync(filePath),
            ContentType: detectedType.mime,
            ACL: "public-read",
          })
          .promise();

        fileUrl = `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${fileName}`;

        // Clean up local file after S3 upload
        fs.unlinkSync(filePath);
      }

      // Create initial media record
      const media = new Media({
        userId,
        fileName,
        originalName: file.originalname,
        mimeType: detectedType.mime,
        fileSize: file.size,
        fileUrl,
        thumbnailUrl: null,
        isOptimized: false,
        isTranscoded: false,
        tags: req.body.tags
          ? req.body.tags.split(",").map((tag) => tag.trim())
          : [],
        category: req.body.category || "video",
      });

      const savedMedia = await media.save();

      // Respond immediately, video processing will happen asynchronously
      logger.info(
        `Video uploaded successfully: ${fileName}, starting processing`
      );

      // Trigger async video processing (thumbnail generation and transcoding)
      processVideo(savedMedia._id, filePath, detectedType.mime);

      return res.status(201).json(savedMedia);
    } else if (detectedType.mime.startsWith("audio/")) {
      // Save audio file
      fs.writeFileSync(filePath, file.buffer);

      // Store audio with basic info
      let fileUrl = `/uploads/${fileName}`;

      if (s3) {
        await s3
          .upload({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: fileName,
            Body: fs.readFileSync(filePath),
            ContentType: detectedType.mime,
            ACL: "public-read",
          })
          .promise();

        fileUrl = `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${fileName}`;

        // Clean up local file after S3 upload
        fs.unlinkSync(filePath);
      }

      // Create audio media record
      const media = new Media({
        userId,
        fileName,
        originalName: file.originalname,
        mimeType: detectedType.mime,
        fileSize: file.size,
        fileUrl,
        isOptimized: true, // No optimization for audio
        tags: req.body.tags
          ? req.body.tags.split(",").map((tag) => tag.trim())
          : [],
        category: req.body.category || "audio",
      });

      const savedMedia = await media.save();
      logger.info(`Audio uploaded successfully: ${fileName}`);
      return res.status(201).json(savedMedia);
    } else {
      return res.status(400).json({ message: "Unsupported media type" });
    }
  } catch (error) {
    logger.error(`Error uploading media: ${error.message}`);
    return res
      .status(500)
      .json({ message: "Failed to upload media", error: error.message });
  }
};

/**
 * Get media by ID
 */
exports.getMediaById = async (req, res) => {
  try {
    const { id } = req.params;

    const media = await Media.findById(id);

    if (!media || media.isDeleted) {
      return res.status(404).json({ message: "Media not found" });
    }

    // Check permissions if media is private
    if (media.isPrivate) {
      const userId = req.user && req.user.id;
      if (media.userId !== userId) {
        return res
          .status(403)
          .json({ message: "Access denied to private media" });
      }
    }

    return res.status(200).json(media);
  } catch (error) {
    logger.error(`Error fetching media: ${error.message}`);
    return res
      .status(500)
      .json({ message: "Failed to fetch media", error: error.message });
  }
};

/**
 * Get all media for a user
 */
exports.getMediaByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, skip = 0, type, category } = req.query;

    const query = {
      userId,
      isDeleted: false,
    };

    // Filter by type if provided
    if (type) {
      query.mimeType = { $regex: `^${type}/` };
    }

    // Filter by category if provided
    if (category) {
      query.category = category;
    }

    // Check if requester can see private media
    const requesterId = req.user && req.user.id;
    if (requesterId !== userId) {
      query.isPrivate = false;
    }

    const media = await Media.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(Number(skip));

    const total = await Media.countDocuments(query);

    return res.status(200).json({
      media,
      pagination: {
        total,
        limit: Number(limit),
        skip: Number(skip),
      },
    });
  } catch (error) {
    logger.error(`Error fetching user media: ${error.message}`);
    return res
      .status(500)
      .json({ message: "Failed to fetch user media", error: error.message });
  }
};

/**
 * Delete media (soft delete)
 */
exports.deleteMedia = async (req, res) => {
  try {
    const { id } = req.params;

    const media = await Media.findById(id);

    if (!media || media.isDeleted) {
      return res.status(404).json({ message: "Media not found" });
    }

    // Check permissions
    const userId = req.user && req.user.id;
    if (media.userId !== userId) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this media" });
    }

    // Soft delete
    media.isDeleted = true;
    await media.save();

    logger.info(`Media soft deleted: ${id}`);
    return res.status(200).json({ message: "Media deleted successfully" });
  } catch (error) {
    logger.error(`Error deleting media: ${error.message}`);
    return res
      .status(500)
      .json({ message: "Failed to delete media", error: error.message });
  }
};

/**
 * Update media metadata
 */
exports.updateMedia = async (req, res) => {
  try {
    const { id } = req.params;
    const { tags, category, isPrivate } = req.body;

    const media = await Media.findById(id);

    if (!media || media.isDeleted) {
      return res.status(404).json({ message: "Media not found" });
    }

    // Check permissions
    const userId = req.user && req.user.id;
    if (media.userId !== userId) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this media" });
    }

    // Update fields if provided
    if (tags !== undefined) {
      media.tags =
        typeof tags === "string"
          ? tags.split(",").map((tag) => tag.trim())
          : tags;
    }

    if (category !== undefined) {
      media.category = category;
    }

    if (isPrivate !== undefined) {
      media.isPrivate = isPrivate;
    }

    await media.save();

    logger.info(`Media updated: ${id}`);
    return res.status(200).json(media);
  } catch (error) {
    logger.error(`Error updating media: ${error.message}`);
    return res
      .status(500)
      .json({ message: "Failed to update media", error: error.message });
  }
};

/**
 * Generate signed URL for direct access
 */
exports.getSignedUrl = async (req, res) => {
  try {
    const { id } = req.params;
    const { expiresIn = 3600 } = req.query; // Default 1 hour

    if (!s3) {
      return res.status(501).json({ message: "S3 storage not configured" });
    }

    const media = await Media.findById(id);

    if (!media || media.isDeleted) {
      return res.status(404).json({ message: "Media not found" });
    }

    // Check permissions if media is private
    if (media.isPrivate) {
      const userId = req.user && req.user.id;
      if (media.userId !== userId) {
        return res
          .status(403)
          .json({ message: "Access denied to private media" });
      }
    }

    const params = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: media.fileName,
      Expires: parseInt(expiresIn),
    };

    const signedUrl = s3.getSignedUrl("getObject", params);

    return res.status(200).json({ signedUrl });
  } catch (error) {
    logger.error(`Error generating signed URL: ${error.message}`);
    return res
      .status(500)
      .json({ message: "Failed to generate signed URL", error: error.message });
  }
};

/**
 * Process video file (async)
 * @param {string} mediaId - ID of the media record
 * @param {string} filePath - Path to the original video file
 * @param {string} mimeType - MIME type of the video
 */
async function processVideo(mediaId, filePath, mimeType) {
  try {
    // First check if file exists (in case of S3 upload, local file might be gone)
    const fileExists = fs.existsSync(filePath);

    // If file doesn't exist locally but we have S3, download it first
    let tempFilePath = filePath;

    if (!fileExists && s3) {
      const media = await Media.findById(mediaId);
      if (!media) return;

      tempFilePath = path.join(UPLOAD_DIR, `temp_${media.fileName}`);

      const s3Params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: media.fileName,
      };

      const s3Object = await s3.getObject(s3Params).promise();
      fs.writeFileSync(tempFilePath, s3Object.Body);
    }

    // Extract video metadata
    const media = await Media.findById(mediaId);

    // Generate thumbnail from video
    const thumbnailFileName = `thumb_${media.fileName.split(".")[0]}.jpg`;
    const thumbnailPath = path.join(UPLOAD_DIR, thumbnailFileName);

    await new Promise((resolve, reject) => {
      ffmpeg(tempFilePath)
        .screenshots({
          timestamps: ["10%"],
          filename: thumbnailFileName,
          folder: UPLOAD_DIR,
          size: "320x240",
        })
        .on("end", resolve)
        .on("error", reject);
    });

    // Get video duration and dimensions
    const metadata = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(tempFilePath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata);
      });
    });

    const videoStream = metadata.streams.find((s) => s.codec_type === "video");
    const duration = metadata.format.duration;
    const dimensions = videoStream
      ? { width: videoStream.width, height: videoStream.height }
      : {};

    // Update media with metadata
    let thumbnailUrl = `/uploads/${thumbnailFileName}`;

    // Upload thumbnail to S3 if configured
    if (s3) {
      await s3
        .upload({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: thumbnailFileName,
          Body: fs.readFileSync(thumbnailPath),
          ContentType: "image/jpeg",
          ACL: "public-read",
        })
        .promise();

      thumbnailUrl = `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${thumbnailFileName}`;

      // Clean up local thumbnail
      fs.unlinkSync(thumbnailPath);
    }

    // Update media with metadata
    await Media.findByIdAndUpdate(mediaId, {
      thumbnailUrl,
      duration,
      dimensions,
      isOptimized: true,
    });

    logger.info(`Video processing completed for ${media.fileName}`);

    // Clean up temp file if we downloaded it
    if (tempFilePath !== filePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  } catch (error) {
    logger.error(`Error processing video: ${error.message}`);
  }
}
