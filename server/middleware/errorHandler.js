const { STATUS_CODES } = require("../utils/constants");

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || STATUS_CODES.INTERNAL_ERROR;
  let message = err.message || "Server Error";

  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    message = "Resource not found";
    statusCode = STATUS_CODES.NOT_FOUND;
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    message = `${field} already exists`;
    statusCode = STATUS_CODES.CONFLICT;
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    message = Object.values(err.errors)
      .map((val) => val.message)
      .join(", ");
    statusCode = STATUS_CODES.BAD_REQUEST;
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    message = "Invalid token";
    statusCode = STATUS_CODES.UNAUTHORIZED;
  }

  if (err.name === "TokenExpiredError") {
    message = "Token expired";
    statusCode = STATUS_CODES.UNAUTHORIZED;
  }

  console.error("Error:", err);

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = errorHandler;
