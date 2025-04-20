const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const Redis = require("ioredis");
const path = require("path");
const fs = require("fs");

// Import utilities
const logger = require("./utils/logger");
const elasticsearchService = require("./utils/elasticsearchService");

// Import routes
const searchRoutes = require("./routes/searchRoutes");

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3004;

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

// Initialize Redis for caching if configured
let redisClient;
if (process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL);
    logger.info(`Redis connected: ${process.env.REDIS_URL}`);

    redisClient.on("error", (err) => {
      logger.error(`Redis error: ${err}`);
    });
  } catch (error) {
    logger.warn(`Redis connection failed: ${error.message}`);
    logger.warn("Running without Redis. Caching will be disabled.");
  }
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
      process.env.MONGODB_URI || "mongodb://localhost:27017/search-service",
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

// Initialize services and database
const initializeServices = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Initialize Elasticsearch indices
    await elasticsearchService.initializeIndices();

    // Check Elasticsearch health
    const health = await elasticsearchService.checkHealth();
    logger.info(`Elasticsearch cluster health: ${health.body.status}`);
  } catch (error) {
    logger.error("Service initialization error:", error);
    // Continue even if Elasticsearch is not available to allow basic functionality
  }
};

// Initialize services
initializeServices();

// Routes
app.use("/api", searchRoutes);

// Health check route
app.get("/health", async (req, res) => {
  try {
    // Check Elasticsearch health
    const esHealth = await elasticsearchService.checkHealth();

    // Check Redis health if configured
    let redisHealth = "not_configured";
    if (redisClient) {
      try {
        await redisClient.ping();
        redisHealth = "green";
      } catch (error) {
        redisHealth = "red";
      }
    }

    // Check MongoDB health
    const mongoHealth = mongoose.connection.readyState === 1 ? "green" : "red";

    return res.status(200).json({
      status: "UP",
      timestamp: new Date().toISOString(),
      service: "search-service",
      dependencies: {
        elasticsearch: esHealth.body ? esHealth.body.status : "red",
        mongodb: mongoHealth,
        redis: redisHealth,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: "DOWN",
      timestamp: new Date().toISOString(),
      service: "search-service",
      error: error.message,
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err);
  res.status(500).json({ message: "Internal Server Error" });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Search service running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");

  // Close Redis connection if exists
  if (redisClient) {
    redisClient.quit();
  }

  mongoose.connection.close(() => {
    logger.info("MongoDB connection closed");
    process.exit(0);
  });
});

module.exports = app;
