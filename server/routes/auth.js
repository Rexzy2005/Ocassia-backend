const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const User = require("../models/User");
const { validate, schemas } = require("../middleware/validation");
const {
  generateToken,
  successResponse,
  errorResponse,
} = require("../utils/helpers");
const {
  STATUS_CODES,
  ERROR_MESSAGES,
  USER_ROLES,
} = require("../utils/constants");

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user (Host, Provider, Center, or regular User)
 * @access  Public
 */
router.post("/register", validate(schemas.register), async (req, res, next) => {
  try {
    const { name, email, password, phone, role } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return errorResponse(
        res,
        STATUS_CODES.CONFLICT,
        ERROR_MESSAGES.USER_EXISTS
      );
    }

    // Create user with role
    const userData = {
      name,
      email,
      password,
      phone,
      role: role || USER_ROLES.HOST,
    };

    // Initialize profile based on role
    if (role === USER_ROLES.HOST) {
      userData.hostProfile = {};
    } else if (role === USER_ROLES.PROVIDER) {
      userData.providerProfile = {};
    } else if (role === USER_ROLES.CENTER) {
      userData.centerProfile = {};
    }

    const user = await User.create(userData);

    // Generate token
    const token = generateToken(user._id);

    successResponse(
      res,
      STATUS_CODES.CREATED,
      { user, token },
      "User registered successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Login user (Host, Provider, Center, or regular User)
 * @access  Public
 */
router.post("/login", validate(schemas.login), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user with password
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return errorResponse(
        res,
        STATUS_CODES.UNAUTHORIZED,
        ERROR_MESSAGES.INVALID_CREDENTIALS
      );
    }

    // Check if user is active
    if (!user.isActive) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Account has been deactivated"
      );
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return errorResponse(
        res,
        STATUS_CODES.UNAUTHORIZED,
        ERROR_MESSAGES.INVALID_CREDENTIALS
      );
    }

    // Generate token
    const token = generateToken(user._id);

    // Remove password from response
    user.password = undefined;

    successResponse(res, STATUS_CODES.OK, { user, token }, "Login successful");
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Send password reset token to email
 * @access  Public
 */
router.post(
  "/forgot-password",
  validate(schemas.forgotPassword),
  async (req, res, next) => {
    try {
      const { email } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
        return errorResponse(
          res,
          STATUS_CODES.NOT_FOUND,
          ERROR_MESSAGES.USER_NOT_FOUND
        );
      }

      // Generate reset token
      const resetToken = user.generateResetToken();
      await user.save({ validateBeforeSave: false });

      // In production, send this token via email
      // For now, we'll return it in the response (NOT RECOMMENDED FOR PRODUCTION)
      const resetUrl = `${req.protocol}://${req.get(
        "host"
      )}/api/auth/reset-password/${resetToken}`;

      successResponse(
        res,
        STATUS_CODES.OK,
        {
          resetToken, // Remove this in production
          resetUrl,
          message: "Password reset token generated. Check your email.",
        },
        "Password reset email sent"
      );

      // TODO: Send email with resetUrl
      // await sendEmail({
      //   to: user.email,
      //   subject: 'Password Reset Request',
      //   text: `Reset your password: ${resetUrl}`
      // });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/auth/reset-password/:resetToken
 * @desc    Reset password using token
 * @access  Public
 */
router.post(
  "/reset-password/:resetToken",
  validate(schemas.resetPassword),
  async (req, res, next) => {
    try {
      const { password } = req.body;

      // Hash token from URL
      const resetPasswordToken = crypto
        .createHash("sha256")
        .update(req.params.resetToken)
        .digest("hex");

      // Find user with valid token
      const user = await User.findOne({
        resetPasswordToken,
        resetPasswordExpire: { $gt: Date.now() },
      });

      if (!user) {
        return errorResponse(
          res,
          STATUS_CODES.BAD_REQUEST,
          ERROR_MESSAGES.INVALID_TOKEN
        );
      }

      // Set new password
      user.password = password;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save();

      // Generate new token
      const token = generateToken(user._id);

      successResponse(
        res,
        STATUS_CODES.OK,
        { token },
        "Password reset successful"
      );
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
