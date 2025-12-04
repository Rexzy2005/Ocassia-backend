const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { jwtSecret } = require("../config/environment");
const { STATUS_CODES, ERROR_MESSAGES } = require("../utils/constants");

/**
 * Protect routes - verify JWT token
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(STATUS_CODES.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.UNAUTHORIZED,
      });
    }

    // Verify token
    const decoded = jwt.verify(token, jwtSecret);

    // Get user from token
    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) {
      return res.status(STATUS_CODES.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.USER_NOT_FOUND,
      });
    }

    console.log(
      `[protect] User authenticated: ${req.user._id}, role: ${req.user.role}`
    );
    next();
  } catch (error) {
    console.error(`[protect] Authentication error:`, error.message);
    return res.status(STATUS_CODES.UNAUTHORIZED).json({
      success: false,
      message: ERROR_MESSAGES.UNAUTHORIZED,
    });
  }
};

/**
 * Authorize specific roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(STATUS_CODES.UNAUTHORIZED).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (!roles.includes(req.user.role)) {
      console.warn(
        `[authorize] User ${req.user._id} with role "${
          req.user.role
        }" tried to access route requiring roles [${roles.join(", ")}]`
      );
      return res.status(STATUS_CODES.FORBIDDEN).json({
        success: false,
        message: `Your role "${
          req.user.role
        }" is not authorized. This route requires role(s): ${roles.join(", ")}`,
      });
    }
    next();
  };
};

module.exports = { protect, authorize };
