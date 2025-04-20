const mongoose = require("mongoose");
const argon2 = require("argon2");
const logger = require("../utils/logger");

// Password configuration for Argon2id (memory cost, time cost, parallelism)
const ARGON2_OPTIONS = {
  type: argon2.argon2id, // Recommended for highest security
  memoryCost: 16384, // 16 MB
  timeCost: 3, // 3 iterations
  parallelism: 2, // 2 parallel threads
  hashLength: 64, // 64 bytes
};

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters long"],
      maxlength: [30, "Username cannot exceed 30 characters"],
    },
    password: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },
    passwordHistory: [
      {
        password: String,
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    passwordLastChanged: {
      type: Date,
      default: Date.now,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    mfaEnabled: {
      type: Boolean,
      default: false,
    },
    mfaMethod: {
      type: String,
      enum: ["none", "totp", "sms", "email"],
      default: "none",
    },
    mfaSecret: {
      type: String,
      default: null,
    },
    backupCodes: [
      {
        code: String,
        used: {
          type: Boolean,
          default: false,
        },
      },
    ],
    lastLogin: {
      date: Date,
      ip: String,
    },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  try {
    // Only hash if password is modified or new
    if (this.isModified("password")) {
      // Store previous password in history
      if (this.password && !this.isNew) {
        // Get the current password before it's changed
        const currentUser = await mongoose.model("User").findById(this._id);
        if (currentUser) {
          // Add current password to history
          this.passwordHistory = this.passwordHistory || [];
          this.passwordHistory.push({
            password: currentUser.password,
            createdAt: new Date(),
          });

          // Keep only last 5 passwords in history
          if (this.passwordHistory.length > 5) {
            this.passwordHistory = this.passwordHistory.slice(-5);
          }
        }
      }

      // Update password last changed date
      this.passwordLastChanged = new Date();

      // Hash the password using Argon2id
      this.password = await argon2.hash(this.password, ARGON2_OPTIONS);

      // Reset failed login attempts when password is changed
      this.failedLoginAttempts = 0;
      this.lockUntil = null;
    }

    next();
  } catch (err) {
    logger.error(`Password hashing error: ${err.message}`);
    next(err);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    // Check if account is locked
    if (this.lockUntil && this.lockUntil > Date.now()) {
      const waitTimeMinutes = Math.ceil((this.lockUntil - Date.now()) / 60000);
      throw new Error(
        `Account is locked. Try again in ${waitTimeMinutes} minutes.`
      );
    }

    // Verify password
    const isMatch = await argon2.verify(
      this.password,
      candidatePassword,
      ARGON2_OPTIONS
    );

    // Handle failed attempts
    if (!isMatch) {
      // Increment failed login attempts
      this.failedLoginAttempts += 1;

      // Implement exponential backoff for account locking
      if (this.failedLoginAttempts >= 10) {
        // Lock for 24 hours after 10 attempts
        this.lockUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      } else if (this.failedLoginAttempts >= 5) {
        // Lock for progressively longer times starting at 5 attempts
        const lockMinutes = Math.pow(2, this.failedLoginAttempts - 5); // 1, 2, 4, 8, 16 minutes
        this.lockUntil = new Date(Date.now() + lockMinutes * 60 * 1000);
      }

      await this.save();
      logger.warn(
        `Failed login attempt ${this.failedLoginAttempts} for user ${this._id}`
      );
    } else {
      // Reset failed attempts on successful login
      if (this.failedLoginAttempts > 0) {
        this.failedLoginAttempts = 0;
        this.lockUntil = null;
        await this.save();
      }
    }

    return isMatch;
  } catch (err) {
    logger.error(`Password verification error: ${err.message}`);
    throw err;
  }
};

// Method to check if the password was used before
userSchema.methods.isPasswordReused = async function (newPassword) {
  if (!this.passwordHistory || this.passwordHistory.length === 0) {
    return false;
  }

  // Check against password history
  for (const historyItem of this.passwordHistory) {
    try {
      if (await argon2.verify(historyItem.password, newPassword)) {
        return true;
      }
    } catch (err) {
      // Continue checking other passwords if one fails
      logger.error(`Error checking password history: ${err.message}`);
    }
  }

  return false;
};

// Index for searching users
userSchema.index({ username: "text", email: "text" });

module.exports = mongoose.model("User", userSchema);
