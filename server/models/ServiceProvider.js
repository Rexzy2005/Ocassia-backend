const mongoose = require("mongoose");

const serviceProviderSchema = new mongoose.Schema(
  {
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Provider reference is required"],
    },
    serviceCategory: {
      type: String,
      required: [true, "Service category is required"],
      enum: [
        "Catering",
        "Photography",
        "Videography",
        "Decoration",
        "DJ/Entertainment",
        "Security",
        "MC/Host",
        "Makeup Artist",
        "Event Planning",
        "Transportation",
        "Other",
      ],
    },
    serviceName: {
      type: String,
      required: [true, "Service name is required"],
      trim: true,
      maxlength: [100, "Service name cannot exceed 100 characters"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },
    pricing: {
      type: {
        type: String,
        enum: ["fixed", "hourly", "package", "negotiable"],
        default: "fixed",
      },
      amount: {
        type: Number,
        min: [0, "Amount cannot be negative"],
      },
      currency: {
        type: String,
        default: "NGN",
      },
      packages: [
        {
          name: { type: String, trim: true },
          description: { type: String, trim: true },
          price: { type: Number, min: 0 },
          features: [{ type: String }],
        },
      ],
    },
    availability: {
      status: {
        type: String,
        enum: ["available", "busy", "unavailable"],
        default: "available",
      },
      unavailableDates: [
        {
          type: Date,
        },
      ],
    },
    serviceArea: {
      states: [{ type: String }],
      cities: [{ type: String }],
      nationwide: {
        type: Boolean,
        default: false,
      },
    },
    images: [
      {
        url: { type: String, required: true },
        caption: { type: String },
        isPrimary: { type: Boolean, default: false },
      },
    ],
    portfolio: [
      {
        title: { type: String },
        description: { type: String },
        images: [{ type: String }],
        date: { type: Date },
      },
    ],
    terms: {
      cancellationPolicy: { type: String },
      refundPolicy: { type: String },
      advanceBookingDays: { type: Number, default: 7 },
      depositRequired: { type: Boolean, default: false },
      depositPercentage: { type: Number, min: 0, max: 100 },
    },
    rating: {
      average: { type: Number, min: 0, max: 5, default: 0 },
      count: { type: Number, default: 0 },
    },
    totalBookings: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
    },
    views: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
serviceProviderSchema.index({ provider: 1 });
serviceProviderSchema.index({ serviceCategory: 1 });
serviceProviderSchema.index({ "availability.status": 1 });
serviceProviderSchema.index({ "rating.average": -1 });
serviceProviderSchema.index({ isActive: 1, verificationStatus: 1 });
serviceProviderSchema.index({ "serviceArea.states": 1 });

module.exports = mongoose.model("ServiceProvider", serviceProviderSchema);
