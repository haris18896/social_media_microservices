const mongoose = require("mongoose");
const { logger } = require("../utils/logger");

let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 5;
const RETRY_INTERVAL = 5000; // 5 seconds

const connectWithRetry = async () => {
  const mongoUri =
    process.env.MONGO_URI || "mongodb://localhost:27017/post_service";

  connectionAttempts++;
  try {
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    logger.info("MongoDB connected successfully");

    // Reset connection attempts on successful connection
    connectionAttempts = 0;

    mongoose.connection.on("error", (err) => {
      logger.error("MongoDB connection error", { error: err.message });

      // If the connection is lost after initial successful connection, try to reconnect
      setTimeout(connectWithRetry, RETRY_INTERVAL);
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn("MongoDB disconnected, attempting to reconnect");
      setTimeout(connectWithRetry, RETRY_INTERVAL);
    });

    // Graceful shutdown
    process.on("SIGINT", async () => {
      try {
        await mongoose.connection.close();
        logger.info("MongoDB connection closed due to application termination");
        process.exit(0);
      } catch (err) {
        logger.error("Error during MongoDB connection close", {
          error: err.message,
        });
        process.exit(1);
      }
    });
  } catch (err) {
    logger.error(`MongoDB connection error on attempt ${connectionAttempts}`, {
      error: err.message,
      mongoUri: mongoUri.replace(/\/\/[^:]+:[^@]+@/, "//****:****@"), // Mask credentials in the URI
    });

    if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
      logger.info(
        `Retrying MongoDB connection in ${RETRY_INTERVAL / 1000} seconds...`
      );
      setTimeout(connectWithRetry, RETRY_INTERVAL);
    } else {
      logger.error(
        `Failed to connect to MongoDB after ${MAX_CONNECTION_ATTEMPTS} attempts`
      );
      process.exit(1);
    }
  }
};

module.exports = { connectWithRetry };
