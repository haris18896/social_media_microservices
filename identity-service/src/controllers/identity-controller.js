const User = require("../models/User");
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const RefreshToken = require("../models/refreshToken");
const {
  validationRegistration,
  validationLogin,
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

//refresh token

// logout

module.exports = { registerUser };
