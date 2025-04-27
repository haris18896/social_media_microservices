require("dotenv").config();
const cors = require("cors");
const helmet = require("helmet");
const Redis = require("ioredis");
const dotenv = require("dotenv");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");

const logger = require("./utils/logger");
const searchRoutes = require("./routes/search-routes");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
const { connectToRabbitMQ, consumeEvent } = require("./utils/rabbitmq");
const { handlePostCreated } = require("./eventHandlers/search-event-handlers");
const ConnectToDB = require("./database/db");

const app = express();
const PORT = process.env.PORT || 3004;

// connect to mongo db
ConnectToDB();
const redisClient = new Redis(process.env.REDIS_URL);

// middleware
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(errorHandler);
app.use(notFoundHandler);

// IP based rate limiting for sensitive endpoints
const sensitiveEndpoints = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.error("Rate limit exceeded for IP: ", req.ip);
    return res.status(429).json({
      message: "Too many requests, please try again later",
    });
  },
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: "rl:sensitive:",
  }),
});

// apply rate limiting to sensitive endpoints
app.use("/api/search", sensitiveEndpoints);

// routes
app.use("/api/search", searchRoutes);

async function startServer() {
  try {
    await connectToRabbitMQ();
    // consume then events  / subscribe to the events
    await consumeEvent("post.created", handlePostCreated);
    app.listen(PORT, () => {
      logger.info(`Search Service is running on port ${PORT}`);
    });
  } catch (error) {
    logger.error("Search Service: Failed to connect to RabbitMQ", error);
    process.exit(1);
  }
}

startServer();

// unhandled promise rejection
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Search Service: Unhandled Rejection at Promise", {
    error: reason?.stack || reason?.message || String(reason),
  });
});
