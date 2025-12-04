const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const eventCenterSchema = new mongoose.Schema(
  {
    // Optional auth/display fields (kept optional when centers don't login separately)
    name: {
      type: String,
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [50, "Name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    password: {
      type: String,
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[0-9]{10,15}$/, "Please enter a valid phone number"],
    },

    // Link back to base User document (owner)
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Password reset
    resetPasswordToken: String,
    resetPasswordExpire: Date,

    // CAC fields
    cacNumber: {
      type: String,
      trim: true,
    },
    cacVerified: {
      type: Boolean,
      default: false,
    },

    // Profile completion
    profileCompleted: {
      type: Boolean,
      default: false,
    },

    // Center-specific fields
    centerName: {
      type: String,
      trim: true,
      maxlength: [100, "Center name cannot exceed 100 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },
    centerType: {
      type: String,
      enum: [
        "Hotel/Resort",
        "Conference Center",
        "Banquet Hall",
        "Outdoor Venue",
        "Community Center",
        "Restaurant/Lounge",
        "Religious Center",
        "Garden/Park",
        "Other",
      ],
    },
    // Listings (halls/spaces) belong to separate Listing collection
    // Reference via eventCenter field in Listing model
    facilities: [
      {
        type: String,
        enum: [
          "Air Conditioning",
          "Parking",
          "WiFi",
          "Sound System",
          "Stage",
          "Projector",
          "Kitchen",
          "Restrooms",
          "Generator",
          "Security",
          "Changing Rooms",
          "Outdoor Space",
          "Catering Services",
          "Bar",
          "Dance Floor",
          "VIP Section",
          "Wheelchair Access",
        ],
      },
    ],
    amenities: [{ type: String }],
    eventTypes: [
      {
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
    ],
    images: [
      {
        url: { type: String, required: true },
        caption: { type: String },
        isPrimary: { type: Boolean, default: false },
      },
    ],
    videos: [
      {
        url: { type: String },
        title: { type: String },
      },
    ],
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
eventCenterSchema.index({ centerType: 1 });
eventCenterSchema.index({ "rating.average": -1 });
eventCenterSchema.index({ isActive: 1, verificationStatus: 1 });

// Hash password before saving (only if password provided/modified)
eventCenterSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  if (!this.password) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
eventCenterSchema.methods.comparePassword = async function (enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate password reset token
eventCenterSchema.methods.generateResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");

  // Hash and set to resetPasswordToken field
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  // Set expire time (10 minutes)
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

// Remove sensitive fields from JSON response
eventCenterSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpire;
  return obj;
};

module.exports = mongoose.model("EventCenter", eventCenterSchema);
