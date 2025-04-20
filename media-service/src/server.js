const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");

// Import utilities and middleware
const logger = require("./utils/logger");

// Import routes
const mediaRoutes = require("./routes/mediaRoutes");

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3003;

// Create uploads directory if it doesn't exist
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "../uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Create keys directory for JWT public key
const KEYS_DIR = path.join(__dirname, "keys");
if (!fs.existsSync(KEYS_DIR)) {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically (for development only, use S3 or a CDN in production)
if (process.env.NODE_ENV !== "production") {
  app.use("/uploads", express.static(UPLOAD_DIR));
}

// Request logger middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  logger.info(`${req.method} ${req.url}`);

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    logger.info(`${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
  });

  next();
});

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/media-service",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );
    logger.info("MongoDB connected successfully");
  } catch (error) {
    logger.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

connectDB();

// Routes
app.use("/api/media", mediaRoutes);

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({ status: "UP" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err);

  // Handle multer errors
  if (err.name === "MulterError") {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: `File size exceeds the limit of ${process.env.MAX_FILE_SIZE / 1048576 || 10}MB`,
      });
    }
    return res.status(400).json({ message: err.message });
  }

  res.status(500).json({ message: "Internal Server Error" });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Media service running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");

  mongoose.connection.close(() => {
    logger.info("MongoDB connection closed");
    process.exit(0);
  });
});

module.exports = app;
