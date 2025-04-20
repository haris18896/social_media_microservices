const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const logger = require("./logger");

const keyPath = path.join(__dirname, "../keys");

/**
 * Generate RSA key pair for JWT signing
 * This is run once during service initialization if keys don't exist
 */
const generateRSAKeys = () => {
  try {
    // Check if keys already exist
    if (
      fs.existsSync(path.join(keyPath, "private.key")) &&
      fs.existsSync(path.join(keyPath, "public.key"))
    ) {
      logger.info("RSA keys already exist");
      return;
    }

    // Ensure the key directory exists
    if (!fs.existsSync(keyPath)) {
      fs.mkdirSync(keyPath, { recursive: true });
    }

    logger.info("Generating new RSA key pair for JWT signing...");

    // Generate a new key pair
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem",
      },
    });

    // Write the keys to files
    fs.writeFileSync(path.join(keyPath, "private.key"), privateKey);
    fs.writeFileSync(path.join(keyPath, "public.key"), publicKey);

    logger.info("RSA key pair generated successfully");
  } catch (error) {
    logger.error("Error generating RSA keys:", error);
    throw error;
  }
};

module.exports = generateRSAKeys;
