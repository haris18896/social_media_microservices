const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const RefreshToken = require("../models/refreshToken");

const generateTokens = async (user) => {
  const accessToken = jwt.sign(
    { userId: user._id },
    process.env.JWT_SECRET_KEY,
    { expiresIn: "15m" }
  );

  const refreshToken = crypto.randomBytes(40).toString("hex");

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // refresh token expires in 7 days

  await RefreshToken.create({
    token: refreshToken,
    userId: user._id,
    expiresAt,
  });

  return { accessToken, refreshToken };
};

module.exports = generateTokens;
