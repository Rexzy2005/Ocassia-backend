const mongoose = require("mongoose");

const listingSchema = new mongoose.Schema(
  {
    // Link to the EventCenter
    eventCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventCenter",
      required: [true, "Event center is required"],
    },
    // Listing details
    hallName: {
      type: String,
      required: [true, "Hall name is required"],
      trim: true,
      maxlength: [100, "Hall name cannot exceed 100 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    // Location for this specific listing
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
    // Capacity for this specific listing
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
    // Pricing for this listing
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
    // Facilities available in this listing
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
    // Event types this listing can host
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
    // Images for this listing
    images: [
      {
        url: { type: String, required: true },
        caption: { type: String },
        isPrimary: { type: Boolean, default: false },
      },
    ],
    // Availability
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
    // Status
    isActive: {
      type: Boolean,
      default: true,
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
listingSchema.index({ eventCenter: 1 });
listingSchema.index({ "location.city": 1, "location.state": 1 });
listingSchema.index({ "capacity.maximum": 1 });
listingSchema.index({ isActive: 1 });

module.exports = mongoose.model("Listing", listingSchema);
