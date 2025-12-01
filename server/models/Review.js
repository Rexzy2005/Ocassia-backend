const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    reviewType: {
      type: String,
      enum: ["provider", "center"],
      required: [true, "Review type is required"],
    },
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Reviewer is required"],
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: [true, "Booking reference is required"],
    },

    // For provider reviews
    serviceProvider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceProvider",
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // For center reviews
    eventCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventCenter",
    },

    // Rating breakdown
    ratings: {
      overall: {
        type: Number,
        required: [true, "Overall rating is required"],
        min: [1, "Rating must be at least 1"],
        max: [5, "Rating cannot exceed 5"],
      },
      quality: {
        type: Number,
        min: [1, "Rating must be at least 1"],
        max: [5, "Rating cannot exceed 5"],
      },
      communication: {
        type: Number,
        min: [1, "Rating must be at least 1"],
        max: [5, "Rating cannot exceed 5"],
      },
      professionalism: {
        type: Number,
        min: [1, "Rating must be at least 1"],
        max: [5, "Rating cannot exceed 5"],
      },
      valueForMoney: {
        type: Number,
        min: [1, "Rating must be at least 1"],
        max: [5, "Rating cannot exceed 5"],
      },
    },

    // Review content
    title: {
      type: String,
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    comment: {
      type: String,
      required: [true, "Comment is required"],
      trim: true,
      minlength: [10, "Comment must be at least 10 characters"],
      maxlength: [1000, "Comment cannot exceed 1000 characters"],
    },

    // Media
    images: [
      {
        url: { type: String },
        caption: { type: String },
      },
    ],

    // Recommendation
    wouldRecommend: {
      type: Boolean,
      default: true,
    },

    // Response from provider/center
    response: {
      text: {
        type: String,
        maxlength: [500, "Response cannot exceed 500 characters"],
      },
      respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      respondedAt: { type: Date },
    },

    // Helpful votes
    helpfulVotes: {
      type: Number,
      default: 0,
    },
    helpfulBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // Moderation
    isVerified: {
      type: Boolean,
      default: false,
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
    reportCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
reviewSchema.index({ serviceProvider: 1, isHidden: 1 });
reviewSchema.index({ eventCenter: 1, isHidden: 1 });
reviewSchema.index({ reviewer: 1 });
reviewSchema.index({ booking: 1 });
reviewSchema.index({ "ratings.overall": -1 });
reviewSchema.index({ createdAt: -1 });

// Prevent duplicate reviews for same booking
reviewSchema.index({ booking: 1, reviewer: 1 }, { unique: true });

module.exports = mongoose.model("Review", reviewSchema);
