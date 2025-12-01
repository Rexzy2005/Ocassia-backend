const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    conversationType: {
      type: String,
      enum: ["direct", "booking", "support"],
      default: "direct",
    },
    relatedBooking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
    },
    relatedServiceProvider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceProvider",
    },
    relatedEventCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventCenter",
    },
    lastMessage: {
      text: { type: String },
      sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      sentAt: { type: Date },
    },
    unreadCount: {
      type: Map,
      of: Number,
      default: {},
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    archivedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
conversationSchema.index({ participants: 1 });
conversationSchema.index({ relatedBooking: 1 });
conversationSchema.index({ "lastMessage.sentAt": -1 });
conversationSchema.index({ isActive: 1, isArchived: 1 });

// Ensure only 2 participants in direct conversations
conversationSchema.pre("save", function (next) {
  if (this.conversationType === "direct" && this.participants.length !== 2) {
    return next(
      new Error("Direct conversations must have exactly 2 participants")
    );
  }
  next();
});

module.exports = mongoose.model("Conversation", conversationSchema);
