const User = require("../models/User");
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const RefreshToken = require("../models/refreshToken");
const {
  validationRegistration,
  validationLogin,
  validationRefreshToken,
} = require("../utils/validation");
const generateTokens = require("../utils/generateToken");

// user registration
const registerUser = async (req, res) => {
  logger.info("Registering user initiated...");
  try {
    const { error } = validationRegistration(req.body);
    if (error) {
      logger.warn("Validation error : ", error.details[0].message);
      return res
        .status(400)
        .json({ success: false, message: error.details[0].message });
    }
    const { username, password, email } = req.body;

    let user = await User.findOne({ $or: [{ username }, { email }] });
    if (user) {
      logger.warn("User already exists");
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });
    }

    user = await User({ username, password, email });
    await user.save();
    logger.info("User registered successfully", user._id);
    const { accessToken, refreshToken } = await generateTokens(user);

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: user,
      accessToken,
      refreshToken,
    });
  } catch (err) {
    logger.error("Error registering user : ", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// user login
const loginUser = async (req, res) => {
  logger.info("Login user initiated...");
  try {
    const { error } = validationLogin(req.body);
    if (error) {
      logger.warn("Validation error : ", error.details[0].message);
      return res
        .status(400)
        .json({ success: false, message: error.details[0].message });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ $or: [{ email }] });
    if (!user) {
      logger.warn("User not found");
      return res
        .status(400)
        .json({ success: false, message: "User not found" });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      logger.warn("Invalid password");
      return res
        .status(400)
        .json({ success: false, message: "Invalid password" });
    }

    const { accessToken, refreshToken } = await generateTokens(user);
    res.status(200).json({
      success: true,
      message: "User logged in successfully",
      userId: user._id,
      accessToken,
      refreshToken,
    });
  } catch (err) {
    logger.error("Error logging in user : ", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

//refresh token
const refreshTokenController = async (req, res) => {
  logger.info("Refresh token initiated...");
  try {
    const { error } = validationRefreshToken(req.body);
    if (error) {
      logger.warn("Validation error : ", error.details[0].message);
      return res
        .status(400)
        .json({ success: false, message: error.details[0].message });
    }
    const { refreshToken } = req.body;
    if (!refreshToken) {
      logger.warn("Refresh token not found");
      return res
        .status(400)
        .json({ success: false, message: "Refresh token not found" });
    }

    const storeToken = await RefreshToken.findOne({ token: refreshToken });
    if (!storeToken || storeToken.expiresAt < Date.now()) {
      logger.warn("Invalid or expired refresh token");
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired refresh token" });
    }

    const user = await User.findById(storeToken.user);
    if (!user) {
      logger.warn("User not found");
      return res
        .status(400)
        .json({ success: false, message: "User not found" });
    }

    const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
      await generateTokens(user);

    await RefreshToken.deleteOne({ _id: storeToken._id });
    res.json({
      success: true,
      message: "Token refreshed successfully",
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    logger.error("Error refreshing token : ", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// logout
const logoutController = async (req, res) => {
  logger.info("Logout initiated...");
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      logger.warn("Refresh token not found");
      return res
        .status(400)
        .json({ success: false, message: "Refresh token not found" });
    }

    await RefreshToken.deleteOne({ token: refreshToken });
    logger.info("Refresh token deleted successfully");
    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (err) {
    logger.error("Error logging out : ", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

module.exports = {
  registerUser,
  loginUser,
  refreshTokenController,
  logoutController,
};
