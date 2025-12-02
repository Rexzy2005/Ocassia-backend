const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const serviceProviderSchema = new mongoose.Schema(
  {
    // Auth fields
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [50, "Name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[0-9]{10,15}$/, "Please enter a valid phone number"],
    },
    role: {
      type: String,
      default: "provider",
      immutable: true,
    },
    // Password reset
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    // Profile completion
    profileCompleted: {
      type: Boolean,
      default: false,
    },
    // Provider-specific fields
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

// Hash password before saving
serviceProviderSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
serviceProviderSchema.methods.comparePassword = async function (
  enteredPassword
) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate password reset token
serviceProviderSchema.methods.generateResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
  return resetToken;
};

// Remove password from JSON response
serviceProviderSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  delete user.resetPasswordToken;
  delete user.resetPasswordExpire;
  return user;
};

// Indexes for performance
serviceProviderSchema.index({ serviceCategory: 1 });
serviceProviderSchema.index({ "availability.status": 1 });
serviceProviderSchema.index({ "rating.average": -1 });
serviceProviderSchema.index({ isActive: 1, verificationStatus: 1 });
serviceProviderSchema.index({ "serviceArea.states": 1 });

module.exports = mongoose.model("ServiceProvider", serviceProviderSchema);
