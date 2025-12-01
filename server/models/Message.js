const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: [true, "Conversation reference is required"],
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Sender is required"],
    },
    messageType: {
      type: String,
      enum: ["text", "image", "file", "booking", "system"],
      default: "text",
    },
    content: {
      text: {
        type: String,
        trim: true,
        maxlength: [2000, "Message cannot exceed 2000 characters"],
      },
      images: [
        {
          url: { type: String },
          caption: { type: String },
        },
      ],
      files: [
        {
          url: { type: String },
          name: { type: String },
          size: { type: Number },
          type: { type: String },
        },
      ],
    },
    // For booking-related messages
    relatedBooking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
    },
    // For system messages
    systemMessage: {
      type: { type: String },
      data: { type: mongoose.Schema.Types.Mixed },
    },
    // Read status
    readBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        readAt: { type: Date, default: Date.now },
      },
    ],
    isRead: {
      type: Boolean,
      default: false,
    },
    // Delivery status
    deliveryStatus: {
      type: String,
      enum: ["sent", "delivered", "read", "failed"],
      default: "sent",
    },
    // Edited message
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
    },
    // Deleted message
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    deletedBy: [
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
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ isRead: 1 });
messageSchema.index({ relatedBooking: 1 });

module.exports = mongoose.model("Message", messageSchema);
