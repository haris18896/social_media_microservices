const nodemailer = require("nodemailer");
const logger = require("./logger");

/**
 * Email Service using Nodemailer
 * Handles sending emails with rate limiting
 */
class EmailService {
  constructor() {
    // Initialize email transporter if credentials are provided
    const host = process.env.EMAIL_HOST;
    const port = process.env.EMAIL_PORT;
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (host && port && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === "465",
        auth: {
          user,
          pass,
        },
      });

      this.fromEmail = process.env.EMAIL_FROM || user;
      this.enabled = true;
      logger.info("Email service initialized with SMTP");
    } else {
      this.enabled = false;
      logger.warn("Email service disabled - missing SMTP credentials");
    }

    // Rate limiting variables
    this.rateLimits = new Map(); // email -> { count, resetTime }
    this.maxEmailsPerHour = 5; // Maximum emails per hour per address
  }

  /**
   * Send email with rate limiting
   * @param {string} to - Recipient email address
   * @param {string} subject - Email subject
   * @param {string} text - Plain text content
   * @param {string} html - HTML content (optional)
   * @returns {Promise} Result of sending email
   */
  async sendEmail(to, subject, text, html) {
    try {
      // Check if email service is enabled
      if (!this.enabled) {
        logger.warn(`Email sending attempted but service is disabled: ${to}`);
        throw new Error("Email service is not configured");
      }

      // Check rate limits
      if (this.isRateLimited(to)) {
        logger.warn(`Email rate limit exceeded for ${to}`);
        throw new Error("Rate limit exceeded for this email address");
      }

      // Send the email via Nodemailer
      const mailOptions = {
        from: `"${process.env.APP_NAME || "Social Media App"}" <${this.fromEmail}>`,
        to,
        subject,
        text,
      };

      if (html) {
        mailOptions.html = html;
      }

      const result = await this.transporter.sendMail(mailOptions);

      // Update rate limiting
      this.updateRateLimit(to);

      logger.info(`Email sent to ${to}: ${result.messageId}`);
      return result;
    } catch (error) {
      logger.error(`Email sending error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if an email address is rate limited
   * @param {string} email - Email address to check
   * @returns {boolean} True if rate limited
   */
  isRateLimited(email) {
    const now = Date.now();
    const limit = this.rateLimits.get(email);

    if (!limit) {
      return false;
    }

    // Check if the rate limit has reset
    if (now > limit.resetTime) {
      this.rateLimits.delete(email);
      return false;
    }

    // Check if count exceeds limit
    return limit.count >= this.maxEmailsPerHour;
  }

  /**
   * Update rate limit counter for an email address
   * @param {string} email - Email address to update
   */
  updateRateLimit(email) {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const limit = this.rateLimits.get(email);

    if (!limit) {
      this.rateLimits.set(email, {
        count: 1,
        resetTime: now + oneHour,
      });
      return;
    }

    // Reset if expired
    if (now > limit.resetTime) {
      this.rateLimits.set(email, {
        count: 1,
        resetTime: now + oneHour,
      });
      return;
    }

    // Increment count
    limit.count += 1;
  }

  /**
   * Generate HTML email template
   * @param {string} content - Main content of email
   * @returns {string} HTML template
   */
  generateHTMLTemplate(content) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Notification</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4a69bd; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .footer { padding: 15px; text-align: center; font-size: 12px; color: #777; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${process.env.APP_NAME || "Social Media App"}</h1>
          </div>
          <div class="content">
            ${content}
          </div>
          <div class="footer">
            <p>This is an automated message, please do not reply directly to this email.</p>
            <p>&copy; ${new Date().getFullYear()} ${process.env.APP_NAME || "Social Media App"}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Mock email sending for development/testing
   * @param {string} to - Recipient email address
   * @param {string} subject - Email subject
   * @param {string} text - Plain text content
   * @param {string} html - HTML content (optional)
   * @returns {Promise} Result of sending email
   */
  async sendMockEmail(to, subject, text, html) {
    logger.debug(`[MOCK EMAIL]
To: ${to}
Subject: ${subject}
Content: ${text}
${html ? "HTML: Yes" : ""}`);

    return { messageId: "MOCK_ID_" + Date.now(), accepted: [to] };
  }
}

// Create a singleton instance
const emailService = new EmailService();

/**
 * Send email with plain text and optional HTML
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} text - Plain text content
 * @param {string} html - HTML content (optional)
 * @returns {Promise} Result of sending email
 */
const sendEmail = async (to, subject, text, html) => {
  // Use mock in development mode if SMTP is not configured
  if (!emailService.enabled && process.env.NODE_ENV !== "production") {
    return emailService.sendMockEmail(to, subject, text, html);
  }

  return emailService.sendEmail(to, subject, text, html);
};

/**
 * Send email with plain text converted to HTML
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} text - Plain text content
 * @returns {Promise} Result of sending email
 */
const sendHTMLEmail = async (to, subject, text) => {
  const content = text.replace(/\n/g, "<br>");
  const html = emailService.generateHTMLTemplate(`<p>${content}</p>`);

  return sendEmail(to, subject, text, html);
};

module.exports = {
  sendEmail,
  sendHTMLEmail,
};
