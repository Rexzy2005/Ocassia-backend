const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const eventCenterSchema = new mongoose.Schema(
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
      default: "center",
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
    // Center-specific fields
    centerName: {
      type: String,
      required: [true, "Center name is required"],
      trim: true,
      maxlength: [100, "Center name cannot exceed 100 characters"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },
    centerType: {
      type: String,
      required: [true, "Center type is required"],
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
    location: {
      address: {
        type: String,
        required: [true, "Address is required"],
        trim: true,
      },
      city: {
        type: String,
        required: [true, "City is required"],
        trim: true,
      },
      state: {
        type: String,
        required: [true, "State is required"],
        trim: true,
      },
      country: {
        type: String,
        default: "Nigeria",
      },
      coordinates: {
        lat: { type: Number },
        lng: { type: Number },
      },
      landmark: { type: String },
    },
    capacity: {
      minimum: {
        type: Number,
        required: [true, "Minimum capacity is required"],
        min: [1, "Minimum capacity must be at least 1"],
      },
      maximum: {
        type: Number,
        required: [true, "Maximum capacity is required"],
        min: [1, "Maximum capacity must be at least 1"],
      },
    },
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
    pricing: {
      type: {
        type: String,
        enum: ["hourly", "daily", "package"],
        default: "daily",
      },
      hourlyRate: {
        type: Number,
        min: [0, "Rate cannot be negative"],
      },
      dailyRate: {
        type: Number,
        min: [0, "Rate cannot be negative"],
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
          duration: { type: String },
          features: [{ type: String }],
        },
      ],
    },
    operatingHours: {
      monday: {
        open: String,
        close: String,
        closed: { type: Boolean, default: false },
      },
      tuesday: {
        open: String,
        close: String,
        closed: { type: Boolean, default: false },
      },
      wednesday: {
        open: String,
        close: String,
        closed: { type: Boolean, default: false },
      },
      thursday: {
        open: String,
        close: String,
        closed: { type: Boolean, default: false },
      },
      friday: {
        open: String,
        close: String,
        closed: { type: Boolean, default: false },
      },
      saturday: {
        open: String,
        close: String,
        closed: { type: Boolean, default: false },
      },
      sunday: {
        open: String,
        close: String,
        closed: { type: Boolean, default: false },
      },
    },
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
    availability: {
      bookedDates: [
        {
          startDate: { type: Date, required: true },
          endDate: { type: Date, required: true },
          booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
        },
      ],
      blockedDates: [
        {
          startDate: { type: Date, required: true },
          endDate: { type: Date, required: true },
          reason: { type: String },
        },
      ],
    },
    terms: {
      cancellationPolicy: { type: String },
      refundPolicy: { type: String },
      advanceBookingDays: { type: Number, default: 7 },
      depositRequired: { type: Boolean, default: true },
      depositPercentage: { type: Number, min: 0, max: 100, default: 50 },
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
eventCenterSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
eventCenterSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate password reset token
eventCenterSchema.methods.generateResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
  return resetToken;
};

// Remove password from JSON response
eventCenterSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  delete user.resetPasswordToken;
  delete user.resetPasswordExpire;
  return user;
};

// Indexes for performance
eventCenterSchema.index({ "location.city": 1, "location.state": 1 });
eventCenterSchema.index({ centerType: 1 });
eventCenterSchema.index({ "rating.average": -1 });
eventCenterSchema.index({ isActive: 1, verificationStatus: 1 });
eventCenterSchema.index({ "pricing.dailyRate": 1 });
eventCenterSchema.index({ "capacity.maximum": 1 });

module.exports = mongoose.model("EventCenter", eventCenterSchema);
