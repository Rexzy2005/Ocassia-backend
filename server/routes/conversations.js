const express = require("express");
const router = express.Router();
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");
const { protect } = require("../middleware/auth");
const { successResponse, errorResponse } = require("../utils/helpers");
const { STATUS_CODES } = require("../utils/constants");

/**
 * @route   GET /api/conversations
 * @desc    Get user's conversations
 * @access  Private
 */
router.get("/", protect, async (req, res, next) => {
  try {
    const {
      type, // 'direct', 'booking', 'support'
      page = 1,
      limit = 20,
      search,
    } = req.query;

    // Build query
    const query = {
      participants: req.user._id,
      isArchived: false,
      $nor: [{ archivedBy: req.user._id }],
    };

    if (type) {
      query.conversationType = type;
    }

    // Search by participant name or last message
    if (search) {
      const users = await User.find({
        name: { $regex: search, $options: "i" },
      }).select("_id");

      const userIds = users.map((u) => u._id);

      query.$or = [
        { participants: { $in: userIds } },
        { "lastMessage.text": { $regex: search, $options: "i" } },
      ];
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get conversations
    const conversations = await Conversation.find(query)
      .populate("participants", "name email phone role")
      .populate("relatedBooking", "bookingNumber eventDetails.eventName status")
      .populate("relatedServiceProvider", "serviceName serviceCategory")
      .populate("relatedEventCenter", "centerName location.city")
      .populate("lastMessage.sender", "name")
      .sort({ "lastMessage.sentAt": -1 })
      .limit(limitNum)
      .skip(skip)
      .lean();

    // Format conversations with unread count for current user
    const formattedConversations = conversations.map((conv) => ({
      ...conv,
      unreadCount: conv.unreadCount?.[req.user._id.toString()] || 0,
      otherParticipants: conv.participants.filter(
        (p) => p._id.toString() !== req.user._id.toString()
      ),
    }));

    // Get total count
    const total = await Conversation.countDocuments(query);

    const pagination = {
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      limit: limitNum,
      hasNext: pageNum < Math.ceil(total / limitNum),
      hasPrev: pageNum > 1,
    };

    successResponse(
      res,
      STATUS_CODES.OK,
      { conversations: formattedConversations, pagination },
      "Conversations retrieved successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/conversations
 * @desc    Create new conversation
 * @access  Private
 */
router.post("/", protect, async (req, res, next) => {
  try {
    const {
      participantId,
      conversationType = "direct",
      relatedBooking,
      relatedServiceProvider,
      relatedEventCenter,
      initialMessage,
    } = req.body;

    if (!participantId) {
      return errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        "Participant ID is required"
      );
    }

    // Validate participant exists
    const participant = await User.findById(participantId);
    if (!participant) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Participant not found"
      );
    }

    // Cannot create conversation with self
    if (participantId === req.user._id.toString()) {
      return errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        "Cannot create conversation with yourself"
      );
    }

    // Check if conversation already exists (for direct messages)
    if (conversationType === "direct") {
      const existingConversation = await Conversation.findOne({
        conversationType: "direct",
        participants: { $all: [req.user._id, participantId], $size: 2 },
      });

      if (existingConversation) {
        await existingConversation.populate(
          "participants",
          "name email phone role"
        );

        return successResponse(
          res,
          STATUS_CODES.OK,
          { conversation: existingConversation },
          "Conversation already exists"
        );
      }
    }

    // Create conversation
    const conversationData = {
      participants: [req.user._id, participantId],
      conversationType,
      relatedBooking,
      relatedServiceProvider,
      relatedEventCenter,
      unreadCount: new Map(),
    };

    // Initialize unread count
    conversationData.unreadCount.set(req.user._id.toString(), 0);
    conversationData.unreadCount.set(participantId, 0);

    const conversation = await Conversation.create(conversationData);

    // Create initial message if provided
    if (initialMessage) {
      const message = await Message.create({
        conversation: conversation._id,
        sender: req.user._id,
        messageType: "text",
        content: { text: initialMessage },
        deliveryStatus: "sent",
      });

      await message.populate("sender", "name email");

      // Update conversation
      conversation.lastMessage = {
        text: initialMessage,
        sender: req.user._id,
        sentAt: new Date(),
      };
      conversation.unreadCount.set(participantId, 1);
      await conversation.save();
    }

    // Populate for response
    await conversation.populate([
      { path: "participants", select: "name email phone role" },
      {
        path: "relatedBooking",
        select: "bookingNumber eventDetails.eventName",
      },
      { path: "relatedServiceProvider", select: "serviceName" },
      { path: "relatedEventCenter", select: "centerName" },
    ]);

    successResponse(
      res,
      STATUS_CODES.CREATED,
      { conversation },
      "Conversation created successfully"
    );

    // TODO: Send notification to participant
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/conversations/:conversationId/messages
 * @desc    Get messages in a conversation
 * @access  Private
 */
router.get("/:conversationId/messages", protect, async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const {
      page = 1,
      limit = 50,
      before, // Timestamp for loading older messages
    } = req.query;

    // Check conversation exists and user is participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Conversation not found"
      );
    }

    const isParticipant = conversation.participants.some(
      (p) => p.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Not authorized to access this conversation"
      );
    }

    // Build query
    const query = {
      conversation: conversationId,
      isDeleted: false,
    };

    // Load messages before a certain timestamp (for pagination)
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get messages
    const messages = await Message.find(query)
      .populate("sender", "name email role")
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skip)
      .lean();

    // Reverse to show oldest first
    messages.reverse();

    // Get total count
    const total = await Message.countDocuments(query);

    const pagination = {
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      limit: limitNum,
      hasNext: pageNum < Math.ceil(total / limitNum),
      hasPrev: pageNum > 1,
    };

    successResponse(
      res,
      STATUS_CODES.OK,
      { messages, pagination },
      "Messages retrieved successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/conversations/:conversationId/messages
 * @desc    Send a message (HTTP fallback for WebSocket)
 * @access  Private
 */
router.post("/:conversationId/messages", protect, async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { text, images, files, messageType = "text" } = req.body;

    // Validate conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Conversation not found"
      );
    }

    // Check if user is participant
    const isParticipant = conversation.participants.some(
      (p) => p.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Not authorized to send messages in this conversation"
      );
    }

    // Validate content
    if (
      !text &&
      (!images || images.length === 0) &&
      (!files || files.length === 0)
    ) {
      return errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        "Message must have text, images, or files"
      );
    }

    // Create message
    const message = await Message.create({
      conversation: conversationId,
      sender: req.user._id,
      messageType,
      content: {
        text: text || "",
        images: images || [],
        files: files || [],
      },
      deliveryStatus: "sent",
    });

    // Populate sender info
    await message.populate("sender", "name email");

    // Update conversation
    conversation.lastMessage = {
      text: text || "Attachment",
      sender: req.user._id,
      sentAt: new Date(),
    };

    // Update unread count
    conversation.participants.forEach((participantId) => {
      if (participantId.toString() !== req.user._id.toString()) {
        const currentCount =
          conversation.unreadCount.get(participantId.toString()) || 0;
        conversation.unreadCount.set(
          participantId.toString(),
          currentCount + 1
        );
      }
    });

    await conversation.save();

    successResponse(
      res,
      STATUS_CODES.CREATED,
      { message },
      "Message sent successfully"
    );

    // Emit via WebSocket if available (HTTP fallback should notify sockets)
    try {
      const io = req.app.get("io");
      const notificationService = req.app.get("notificationService");

      if (io) {
        // Emit both legacy and new event names for frontend compatibility
        io.to(`conversation:${conversationId}`).emit("message:new", {
          message,
          conversation: {
            _id: conversation._id,
            lastMessage: conversation.lastMessage,
            unreadCount: Object.fromEntries(conversation.unreadCount),
          },
        });

        io.to(`conversation:${conversationId}`).emit("new_message", {
          conversationId,
          message,
        });

        // Notify each participant (except sender)
        conversation.participants.forEach((participantId) => {
          const participantIdStr = participantId.toString();
          if (participantIdStr !== req.user._id.toString()) {
            // emit notification events to the user's personal room
            io.to(`user:${participantIdStr}`).emit("notification:new", {
              type: "message",
              conversationId,
              message: message.content?.text || "",
            });

            io.to(`user:${participantIdStr}`).emit("new_notification", {
              conversationId,
              message: message.content?.text || "",
            });

            // Persist a notification via NotificationService (if available)
            if (notificationService && typeof notificationService.notifyMessageReceived === "function") {
              // fire-and-forget
              notificationService
                .notifyMessageReceived(message, participantIdStr, req.user.name || req.user.email)
                .catch(() => {});
            }
          }
        });
      }
    } catch (emitErr) {
      // don't block the request on socket errors
      console.warn("Socket emit failed:", emitErr.message || emitErr);
    }
    // TODO: Send push notification
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/conversations/:conversationId/read
 * @desc    Mark conversation as read
 * @access  Private
 */
router.put("/:conversationId/read", protect, async (req, res, next) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Conversation not found"
      );
    }

    // Check if user is participant
    const isParticipant = conversation.participants.some(
      (p) => p.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Not authorized to access this conversation"
      );
    }

    // Mark all unread messages as read
    await Message.updateMany(
      {
        conversation: conversationId,
        sender: { $ne: req.user._id },
        isRead: false,
      },
      {
        isRead: true,
        deliveryStatus: "read",
        $addToSet: {
          readBy: {
            user: req.user._id,
            readAt: new Date(),
          },
        },
      }
    );

    // Reset unread count
    conversation.unreadCount.set(req.user._id.toString(), 0);
    await conversation.save();

    successResponse(
      res,
      STATUS_CODES.OK,
      { conversationId, unreadCount: 0 },
      "Conversation marked as read"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/conversations/:conversationId/archive
 * @desc    Archive conversation
 * @access  Private
 */
router.put("/:conversationId/archive", protect, async (req, res, next) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Conversation not found"
      );
    }

    // Check if user is participant
    const isParticipant = conversation.participants.some(
      (p) => p.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Not authorized to archive this conversation"
      );
    }

    // Add user to archivedBy array
    if (!conversation.archivedBy.includes(req.user._id)) {
      conversation.archivedBy.push(req.user._id);
      await conversation.save();
    }

    successResponse(
      res,
      STATUS_CODES.OK,
      { conversation },
      "Conversation archived successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/conversations/:conversationId/unarchive
 * @desc    Unarchive conversation
 * @access  Private
 */
router.put("/:conversationId/unarchive", protect, async (req, res, next) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Conversation not found"
      );
    }

    // Remove user from archivedBy array
    conversation.archivedBy = conversation.archivedBy.filter(
      (id) => id.toString() !== req.user._id.toString()
    );
    await conversation.save();

    successResponse(
      res,
      STATUS_CODES.OK,
      { conversation },
      "Conversation unarchived successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/conversations/unread-count
 * @desc    Get total unread message count
 * @access  Private
 */
router.get("/unread-count", protect, async (req, res, next) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id,
      isArchived: false,
    }).select("unreadCount");

    let totalUnread = 0;
    conversations.forEach((conv) => {
      totalUnread += conv.unreadCount.get(req.user._id.toString()) || 0;
    });

    successResponse(
      res,
      STATUS_CODES.OK,
      { totalUnread },
      "Unread count retrieved"
    );
  } catch (error) {
    next(error);
  }
});

module.exports = router;
