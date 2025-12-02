const mongoose = require("mongoose");
const { BOOKING_STATUS } = require("../utils/constants");

const bookingSchema = new mongoose.Schema(
  {
    bookingType: {
      type: String,
      enum: ["provider", "center"],
      required: [true, "Booking type is required"],
    },
    bookingNumber: {
      type: String,
      unique: true,
      required: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Customer is required"],
    },

    // Provider booking details
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    serviceProvider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceProvider",
    },

    // Center booking details
    eventCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventCenter",
    },

    // Common booking details
    eventDetails: {
      eventName: {
        type: String,
        trim: true,
        maxlength: [100, "Event name cannot exceed 100 characters"],
      },
      eventType: {
        type: String,
        enum: [
          "Wedding",
          "Birthday",
          "Corporate",
          "Conference",
          "Workshop",
          "Concert",
          "Exhibition",
          "Religious",
          "Social",
          "Other",
        ],
      },
      eventDate: {
        type: Date,
        required: [true, "Event date is required"],
      },
      startTime: {
        type: String,
        required: [true, "Start time is required"],
      },
      endTime: {
        type: String,
        required: [true, "End time is required"],
      },
      guestCount: {
        type: Number,
        min: [1, "Guest count must be at least 1"],
      },
      specialRequests: {
        type: String,
        maxlength: [1000, "Special requests cannot exceed 1000 characters"],
      },
    },

    // Financial details
    pricing: {
      baseAmount: {
        type: Number,
        required: [true, "Base amount is required"],
        min: [0, "Amount cannot be negative"],
      },
      additionalCharges: [
        {
          description: { type: String },
          amount: { type: Number, min: 0 },
        },
      ],
      discount: {
        type: Number,
        default: 0,
        min: [0, "Discount cannot be negative"],
      },
      totalAmount: {
        type: Number,
        required: [true, "Total amount is required"],
        min: [0, "Total amount cannot be negative"],
      },
      currency: {
        type: String,
        default: "NGN",
      },
    },

    // Payment details
    paymentStatus: {
      type: String,
      enum: ["pending", "partial", "completed", "refunded"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["escrow", "direct", "cash"],
      default: "escrow",
    },
    depositPaid: {
      type: Number,
      default: 0,
      min: [0, "Deposit cannot be negative"],
    },
    balanceDue: {
      type: Number,
      default: 0,
      min: [0, "Balance cannot be negative"],
    },

    // Booking status
    status: {
      type: String,
      enum: Object.values(BOOKING_STATUS),
      default: BOOKING_STATUS.PENDING,
    },

    // Status tracking
    statusHistory: [
      {
        status: { type: String },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        changedAt: { type: Date, default: Date.now },
        reason: { type: String },
      },
    ],

    // Cancellation details
    cancellation: {
      cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      cancelledAt: { type: Date },
      reason: { type: String },
      refundAmount: { type: Number, min: 0 },
      refundStatus: {
        type: String,
        enum: ["pending", "processing", "completed", "rejected"],
      },
    },

    // Communication
    notes: {
      type: String,
      maxlength: [2000, "Notes cannot exceed 2000 characters"],
    },
    internalNotes: {
      type: String,
      maxlength: [1000, "Internal notes cannot exceed 1000 characters"],
    },

    // Review
    reviewed: {
      type: Boolean,
      default: false,
    },
    review: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Review",
    },
  },
  {
    timestamps: true,
  }
);

// Generate unique booking number before saving
bookingSchema.pre("save", async function (next) {
  if (!this.bookingNumber) {
    const prefix = this.bookingType === "provider" ? "PRV" : "CTR";
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0");
    this.bookingNumber = `${prefix}-${timestamp}-${random}`;
  }
  next();
});

// Calculate balance due
bookingSchema.pre("save", function (next) {
  this.balanceDue = this.pricing.totalAmount - this.depositPaid;
  next();
});

// Indexes for performance
bookingSchema.index({ customer: 1, status: 1 });
bookingSchema.index({ provider: 1, status: 1 });
bookingSchema.index({ eventCenter: 1, "eventDetails.eventDate": 1 });
bookingSchema.index({ serviceProvider: 1, status: 1 });
bookingSchema.index({ "eventDetails.eventDate": 1 });
bookingSchema.index({ status: 1, paymentStatus: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
