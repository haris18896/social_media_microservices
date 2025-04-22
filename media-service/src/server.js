const dotenv = require("dotenv");
dotenv.config();

const cors = require("cors");
const helmet = require("helmet");
const Redis = require("ioredis");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");

const logger = require("./utils/logger");
const ConnectToDB = require("./database/db");
const mediaRoutes = require("./routes/media-routes");
const { errorHandler } = require("./middleware/errorHandler");

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Redis Client
const redisClient = new Redis(process.env.REDIS_URL);

app.use(cors());
app.use(helmet());
app.use(errorHandler);
app.use(express.json());

app.use((req, res, next) => {
  logger.info(`Received ${req.method} request to ${req.url}`);
  logger.info(`Request body: ${JSON.stringify(req.body)}`);
  next();
});

ConnectToDB();

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

app.use("/api/media", sensitiveEndpoints, mediaRoutes);

app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});

// Unhandled promise rejection
process.on("unhandledRejection", (reason, promise) => {
  // Log the reason and promise separately for clarity
  logger.error("Unhandled Rejection at Promise:", promise);
  logger.error("Reason:", reason);
});
