const jwt = require("jsonwebtoken");
const { jwtSecret, jwtExpire } = require("../config/environment");

/**
 * Generate JWT token
 */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, jwtSecret, {
    expiresIn: jwtExpire,
  });
};

/**
 * Standard success response
 */
const successResponse = (res, statusCode, data, message = "Success") => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Standard error response
 */
const errorResponse = (res, statusCode, message, errors = null) => {
  const response = {
    success: false,
    message,
  };

  if (errors) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
};

module.exports = {
  generateToken,
  successResponse,
  errorResponse,
};
