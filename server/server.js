const app = require("./app");
const connectDB = require("./config/database");
const { setupSocket } = require("./config/socket");
const NotificationService = require("./services/notificationService");
const { port, env } = require("./config/environment");

// Connect to database
connectDB();

// Start server
const server = app.listen(port, () => {
  console.log(`Server running in ${env} mode on port ${port}`);
});

// Setup Socket.io
const io = setupSocket(server);
console.log("Socket.io initialized");

// Initialize notification service
const notificationService = new NotificationService(io);

// Make io and notificationService accessible to routes
app.set("io", io);
app.set("notificationService", notificationService);

// Schedule notification cleanup (run daily)
if (env === "production") {
  setInterval(() => {
    notificationService.cleanupOldNotifications(30);
  }, 24 * 60 * 60 * 1000); // Run every 24 hours
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error(`Uncaught Exception: ${err.message}`);
  process.exit(1);
});
