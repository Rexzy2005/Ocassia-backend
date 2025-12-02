const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { jwtSecret } = require("./environment");
const User = require("../models/User");
const Message = require("../models/Message");
const Conversation = require("../models/Conversation");

// Store active connections
const activeUsers = new Map();

const setupSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(",") || [
        "http://localhost:3000",
      ],
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.split(" ")[1];

      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      const decoded = jwt.verify(token, jwtSecret);
      const user = await User.findById(decoded.id).select("-password");

      if (!user) {
        return next(new Error("Authentication error: User not found"));
      }

      socket.userId = user._id.toString();
      socket.user = user;
      next();
    } catch (error) {
      next(new Error("Authentication error: Invalid token"));
    }
  });

  // Connection handler
  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.userId}`);

    // Store active user
    activeUsers.set(socket.userId, {
      socketId: socket.id,
      userId: socket.userId,
      connectedAt: new Date(),
    });

    // Broadcast online status
    io.emit("user:online", { userId: socket.userId });

    // Join user's personal room
    socket.join(`user:${socket.userId}`);

    // Join conversation rooms
    socket.on("conversation:join", async (conversationId) => {
      try {
        const conversation = await Conversation.findById(conversationId);

        if (!conversation) {
          socket.emit("error", { message: "Conversation not found" });
          return;
        }

        // Check if user is participant
        const isParticipant = conversation.participants.some(
          (p) => p.toString() === socket.userId
        );

        if (!isParticipant) {
          socket.emit("error", {
            message: "Not authorized to join this conversation",
          });
          return;
        }

        socket.join(`conversation:${conversationId}`);
        socket.emit("conversation:joined", { conversationId });
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    // Leave conversation room
    socket.on("conversation:leave", (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
      socket.emit("conversation:left", { conversationId });
    });

    // Send message
    socket.on("message:send", async (data) => {
      try {
        const { conversationId, content, messageType = "text" } = data;

        // Validate conversation
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          socket.emit("error", { message: "Conversation not found" });
          return;
        }

        // Check if user is participant
        const isParticipant = conversation.participants.some(
          (p) => p.toString() === socket.userId
        );

        if (!isParticipant) {
          socket.emit("error", { message: "Not authorized to send messages" });
          return;
        }

        // Create message
        const message = await Message.create({
          conversation: conversationId,
          sender: socket.userId,
          messageType,
          content: {
            text: content.text,
            images: content.images || [],
            files: content.files || [],
          },
          deliveryStatus: "sent",
        });

        // Populate sender info
        await message.populate("sender", "name email");

        // Update conversation last message
        conversation.lastMessage = {
          text: content.text || "Attachment",
          sender: socket.userId,
          sentAt: new Date(),
        };

        // Update unread count for other participants
        conversation.participants.forEach((participantId) => {
          if (participantId.toString() !== socket.userId) {
            const currentCount =
              conversation.unreadCount.get(participantId.toString()) || 0;
            conversation.unreadCount.set(
              participantId.toString(),
              currentCount + 1
            );
          }
        });

        await conversation.save();

        // Emit to conversation room
        io.to(`conversation:${conversationId}`).emit("message:new", {
          message,
          conversation: {
            _id: conversation._id,
            lastMessage: conversation.lastMessage,
            unreadCount: Object.fromEntries(conversation.unreadCount),
          },
        });

        // Send push notification to offline users
        conversation.participants.forEach((participantId) => {
          const participantIdStr = participantId.toString();
          if (
            participantIdStr !== socket.userId &&
            !activeUsers.has(participantIdStr)
          ) {
            // TODO: Send push notification
            io.to(`user:${participantIdStr}`).emit("notification:new", {
              type: "message",
              conversationId,
              message: content.text,
            });
          }
        });
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    // Typing indicator
    socket.on("typing:start", (conversationId) => {
      socket.to(`conversation:${conversationId}`).emit("typing:user", {
        userId: socket.userId,
        userName: socket.user.name,
        conversationId,
      });
    });

    socket.on("typing:stop", (conversationId) => {
      socket.to(`conversation:${conversationId}`).emit("typing:stop", {
        userId: socket.userId,
        conversationId,
      });
    });

    // Mark messages as read
    socket.on("messages:read", async (data) => {
      try {
        const { conversationId, messageIds } = data;

        await Message.updateMany(
          {
            _id: { $in: messageIds },
            conversation: conversationId,
            sender: { $ne: socket.userId },
          },
          {
            isRead: true,
            deliveryStatus: "read",
            $addToSet: {
              readBy: {
                user: socket.userId,
                readAt: new Date(),
              },
            },
          }
        );

        // Update conversation unread count
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          conversation.unreadCount.set(socket.userId, 0);
          await conversation.save();

          // Notify other participants
          socket.to(`conversation:${conversationId}`).emit("messages:read", {
            userId: socket.userId,
            messageIds,
            conversationId,
          });
        }
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    // Edit message
    socket.on("message:edit", async (data) => {
      try {
        const { messageId, newText } = data;

        const message = await Message.findById(messageId);
        if (!message) {
          socket.emit("error", { message: "Message not found" });
          return;
        }

        if (message.sender.toString() !== socket.userId) {
          socket.emit("error", {
            message: "Not authorized to edit this message",
          });
          return;
        }

        message.content.text = newText;
        message.isEdited = true;
        message.editedAt = new Date();
        await message.save();

        io.to(`conversation:${message.conversation}`).emit("message:edited", {
          messageId,
          newText,
          editedAt: message.editedAt,
        });
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    // Delete message
    socket.on("message:delete", async (data) => {
      try {
        const { messageId } = data;

        const message = await Message.findById(messageId);
        if (!message) {
          socket.emit("error", { message: "Message not found" });
          return;
        }

        if (message.sender.toString() !== socket.userId) {
          socket.emit("error", {
            message: "Not authorized to delete this message",
          });
          return;
        }

        message.isDeleted = true;
        message.deletedAt = new Date();
        message.deletedBy.push(socket.userId);
        await message.save();

        io.to(`conversation:${message.conversation}`).emit("message:deleted", {
          messageId,
          deletedAt: message.deletedAt,
        });
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.userId}`);
      activeUsers.delete(socket.userId);

      // Broadcast offline status
      io.emit("user:offline", {
        userId: socket.userId,
        lastSeen: new Date(),
      });
    });

    // Handle errors
    socket.on("error", (error) => {
      console.error("Socket error:", error);
    });
  });

  return io;
};

// Helper function to get active users
const getActiveUsers = () => {
  return Array.from(activeUsers.values());
};

// Helper function to check if user is online
const isUserOnline = (userId) => {
  return activeUsers.has(userId.toString());
};

module.exports = {
  setupSocket,
  getActiveUsers,
  isUserOnline,
};
