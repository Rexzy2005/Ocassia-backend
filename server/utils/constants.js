module.exports = {
  // User Roles
  USER_ROLES: {
    ADMIN: "admin",
    HOST: "host",
    PROVIDER: "provider",
    CENTER: "center",
  },

  // Booking Status
  BOOKING_STATUS: {
    PENDING: "pending",
    CONFIRMED: "confirmed",
    CANCELLED: "cancelled",
    COMPLETED: "completed",
  },

  // CAC Verification Status
  CAC_STATUS: {
    PENDING: "pending",
    VERIFIED: "verified",
    REJECTED: "rejected",
  },

  // HTTP Status Codes
  STATUS_CODES: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_ERROR: 500,
  },

  // Error Messages
  ERROR_MESSAGES: {
    INVALID_CREDENTIALS: "Invalid email or password",
    UNAUTHORIZED: "Not authorized to access this route",
    USER_EXISTS: "User already exists",
    USER_NOT_FOUND: "User not found",
    BOOKING_NOT_FOUND: "Booking not found",
    VALIDATION_ERROR: "Validation error",
    SERVER_ERROR: "Server error",
    INVALID_TOKEN: "Invalid or expired token",
    ADMIN_ONLY: "Admin access required",
  },
};
