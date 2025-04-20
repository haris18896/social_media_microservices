const twilio = require("twilio");
const logger = require("./logger");

/**
 * SMS Service using Twilio
 * Handles sending SMS messages with rate limiting
 */
class SMSService {
  constructor() {
    // Initialize Twilio client if credentials are provided
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (accountSid && authToken) {
      this.client = twilio(accountSid, authToken);
      this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
      this.enabled = true;
      logger.info("SMS service initialized with Twilio");
    } else {
      this.enabled = false;
      logger.warn("SMS service disabled - missing Twilio credentials");
    }

    // Rate limiting variables
    this.rateLimits = new Map(); // phoneNumber -> { count, resetTime }
    this.maxSmsPerHour = 5; // Maximum SMS per hour per number
  }

  /**
   * Send SMS message with rate limiting
   * @param {string} to - Recipient phone number
   * @param {string} message - Message content
   * @returns {Promise} Result of sending SMS
   */
  async sendSMS(to, message) {
    try {
      // Check if SMS service is enabled
      if (!this.enabled) {
        logger.warn(`SMS sending attempted but service is disabled: ${to}`);
        throw new Error("SMS service is not configured");
      }

      // Check rate limits
      if (this.isRateLimited(to)) {
        logger.warn(`SMS rate limit exceeded for ${to}`);
        throw new Error("Rate limit exceeded for this phone number");
      }

      // Send the SMS via Twilio
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: to,
      });

      // Update rate limiting
      this.updateRateLimit(to);

      logger.info(`SMS sent to ${to}: ${result.sid}`);
      return result;
    } catch (error) {
      // Special handling for Twilio errors
      if (error.code) {
        logger.error(`Twilio error ${error.code}: ${error.message}`);
      } else {
        logger.error(`SMS sending error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Check if a phone number is rate limited
   * @param {string} phoneNumber - Phone number to check
   * @returns {boolean} True if rate limited
   */
  isRateLimited(phoneNumber) {
    const now = Date.now();
    const limit = this.rateLimits.get(phoneNumber);

    if (!limit) {
      return false;
    }

    // Check if the rate limit has reset
    if (now > limit.resetTime) {
      this.rateLimits.delete(phoneNumber);
      return false;
    }

    // Check if count exceeds limit
    return limit.count >= this.maxSmsPerHour;
  }

  /**
   * Update rate limit counter for a phone number
   * @param {string} phoneNumber - Phone number to update
   */
  updateRateLimit(phoneNumber) {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const limit = this.rateLimits.get(phoneNumber);

    if (!limit) {
      this.rateLimits.set(phoneNumber, {
        count: 1,
        resetTime: now + oneHour,
      });
      return;
    }

    // Reset if expired
    if (now > limit.resetTime) {
      this.rateLimits.set(phoneNumber, {
        count: 1,
        resetTime: now + oneHour,
      });
      return;
    }

    // Increment count
    limit.count += 1;
  }

  /**
   * Mock SMS sending for development/testing
   * @param {string} to - Recipient phone number
   * @param {string} message - Message content
   * @returns {Promise} Result of sending SMS
   */
  async sendMockSMS(to, message) {
    logger.debug(`[MOCK SMS] To: ${to}, Message: ${message}`);
    return { sid: "MOCK_SID_" + Date.now(), status: "sent" };
  }
}

// Create a singleton instance
const smsService = new SMSService();

/**
 * Send SMS message
 * @param {string} to - Recipient phone number
 * @param {string} message - Message content
 * @returns {Promise} Result of sending SMS
 */
const sendSMS = async (to, message) => {
  // Use mock in development mode if Twilio is not configured
  if (!smsService.enabled && process.env.NODE_ENV !== "production") {
    return smsService.sendMockSMS(to, message);
  }

  return smsService.sendSMS(to, message);
};

module.exports = { sendSMS };
