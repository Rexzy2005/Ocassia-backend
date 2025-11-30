const mongoose = require("mongoose");
const { BOOKING_STATUS } = require("../utils/constants");

const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    serviceName: {
      type: String,
      required: [true, "Service name is required"],
      trim: true,
    },
    serviceProvider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    bookingDate: {
      type: Date,
      required: [true, "Booking date is required"],
    },
    startTime: {
      type: String,
      required: [true, "Start time is required"],
    },
    endTime: {
      type: String,
      required: [true, "End time is required"],
    },
    status: {
      type: String,
      enum: Object.values(BOOKING_STATUS),
      default: BOOKING_STATUS.PENDING,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, "Notes cannot exceed 500 characters"],
    },
    price: {
      type: Number,
      min: [0, "Price cannot be negative"],
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
bookingSchema.index({ user: 1, bookingDate: 1 });
bookingSchema.index({ serviceProvider: 1, bookingDate: 1 });
bookingSchema.index({ status: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
