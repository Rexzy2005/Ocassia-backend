const express = require("express");
const router = express.Router();
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
 * @route   POST /api/admin/login
 * @desc    Admin login with role verification
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

    // Check if user is admin
    if (user.role !== USER_ROLES.ADMIN) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        ERROR_MESSAGES.ADMIN_ONLY
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

    successResponse(
      res,
      STATUS_CODES.OK,
      { user, token },
      "Admin login successful"
    );
  } catch (error) {
    next(error);
  }
});

module.exports = router;
