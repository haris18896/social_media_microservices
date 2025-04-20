const Joi = require("joi");
const logger = require("./logger");

// Password complexity regex
const passwordComplexityRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

/**
 * Validates user registration data
 * @param {Object} data - Registration data
 * @returns {Object} Validation result
 */
const validationRegistration = (data) => {
  logger.debug("Validating user registration data");

  const schema = Joi.object({
    username: Joi.string().min(3).max(30).required().trim().messages({
      "string.min": "Username must be at least 3 characters long",
      "string.max": "Username cannot exceed 30 characters",
      "any.required": "Username is required",
    }),

    password: Joi.string()
      .min(8)
      .max(100)
      .pattern(passwordComplexityRegex)
      .required()
      .messages({
        "string.min": "Password must be at least 8 characters long",
        "string.max": "Password cannot exceed 100 characters",
        "string.pattern.base":
          "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
        "any.required": "Password is required",
      }),

    email: Joi.string()
      .email({ minDomainSegments: 2 })
      .required()
      .trim()
      .lowercase()
      .messages({
        "string.email": "Please provide a valid email address",
        "any.required": "Email address is required",
      }),
  });

  return schema.validate(data, { abortEarly: false });
};

/**
 * Validates user login data
 * @param {Object} data - Login data
 * @returns {Object} Validation result
 */
const validationLogin = (data) => {
  logger.debug("Validating user login data");

  const schema = Joi.object({
    email: Joi.string().email().required().trim().lowercase().messages({
      "string.email": "Please provide a valid email address",
      "any.required": "Email address is required",
    }),

    password: Joi.string().required().messages({
      "any.required": "Password is required",
    }),
  });

  return schema.validate(data, { abortEarly: false });
};

/**
 * Validates refresh token data
 * @param {Object} data - Refresh token data
 * @returns {Object} Validation result
 */
const validationRefreshToken = (data) => {
  logger.debug("Validating refresh token data");

  const schema = Joi.object({
    refreshToken: Joi.string().required().messages({
      "any.required": "Refresh token is required",
    }),
  });

  return schema.validate(data, { abortEarly: false });
};

/**
 * Validates password change data
 * @param {Object} data - Password change data
 * @returns {Object} Validation result
 */
const validationPasswordChange = (data) => {
  logger.debug("Validating password change data");

  const schema = Joi.object({
    currentPassword: Joi.string().required().messages({
      "any.required": "Current password is required",
    }),

    newPassword: Joi.string()
      .min(8)
      .max(100)
      .pattern(passwordComplexityRegex)
      .required()
      .disallow(Joi.ref("currentPassword"))
      .messages({
        "string.min": "New password must be at least 8 characters long",
        "string.max": "New password cannot exceed 100 characters",
        "string.pattern.base":
          "New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
        "any.required": "New password is required",
        "any.invalid": "New password must be different from current password",
      }),

    confirmPassword: Joi.string()
      .valid(Joi.ref("newPassword"))
      .required()
      .messages({
        "any.only": "Passwords do not match",
        "any.required": "Please confirm your new password",
      }),
  });

  return schema.validate(data, { abortEarly: false });
};

/**
 * Validates MFA setup data
 * @param {Object} data - MFA setup data
 * @returns {Object} Validation result
 */
const validationMFASetup = (data) => {
  logger.debug("Validating MFA setup data");

  const schema = Joi.object({
    mfaMethod: Joi.string().valid("totp", "sms", "email").required().messages({
      "any.only": "Invalid MFA method",
      "any.required": "MFA method is required",
    }),

    phoneNumber: Joi.when("mfaMethod", {
      is: "sms",
      then: Joi.string()
        .required()
        .pattern(/^\+\d{10,15}$/)
        .messages({
          "string.pattern.base":
            "Phone number must be in international format (e.g., +1234567890)",
          "any.required": "Phone number is required for SMS MFA",
        }),
      otherwise: Joi.optional(),
    }),
  });

  return schema.validate(data, { abortEarly: false });
};

module.exports = {
  validationRegistration,
  validationLogin,
  validationRefreshToken,
  validationPasswordChange,
  validationMFASetup,
};
