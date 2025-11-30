const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { validate, schemas } = require("../middleware/validation");
const {
  generateToken,
  successResponse,
  errorResponse,
} = require("../utils/helpers");
const { STATUS_CODES, ERROR_MESSAGES } = require("../utils/constants");

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
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

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      phone,
      role,
    });

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
 * @desc    Login user
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

module.exports = router;
