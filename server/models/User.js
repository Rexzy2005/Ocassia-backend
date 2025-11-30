const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { USER_ROLES } = require("../utils/constants");

const userSchema = new mongoose.Schema(
  {
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
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.USER,
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // Host-specific fields
    hostProfile: {
      businessName: { type: String, trim: true },
      businessAddress: { type: String, trim: true },
      businessType: { type: String, trim: true },
      cacNumber: { type: String, trim: true },
      cacVerified: { type: Boolean, default: false },
      cacDocument: { type: String }, // URL to uploaded document
      description: { type: String, maxlength: 1000 },
    },

    // Provider-specific fields
    providerProfile: {
      companyName: { type: String, trim: true },
      serviceType: { type: String, trim: true },
      experience: { type: Number, min: 0 },
      certifications: [{ type: String }],
      portfolio: [{ type: String }], // URLs
      rating: { type: Number, min: 0, max: 5, default: 0 },
      reviewCount: { type: Number, default: 0 },
    },

    // Center-specific fields
    centerProfile: {
      centerName: { type: String, trim: true },
      centerType: { type: String, trim: true },
      location: {
        address: { type: String },
        city: { type: String },
        state: { type: String },
        coordinates: {
          lat: { type: Number },
          lng: { type: Number },
        },
      },
      facilities: [{ type: String }],
      capacity: { type: Number, min: 0 },
      operatingHours: {
        open: { type: String },
        close: { type: String },
      },
      amenities: [{ type: String }],
    },

    // Password reset
    resetPasswordToken: String,
    resetPasswordExpire: Date,

    // Profile completion
    profileCompleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate password reset token
userSchema.methods.generateResetToken = function () {
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

// Remove password from JSON response
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  delete user.resetPasswordToken;
  delete user.resetPasswordExpire;
  return user;
};

module.exports = mongoose.model("User", userSchema);
