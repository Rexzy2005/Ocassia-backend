const app = require("./app");
const connectDB = require("./config/database");
const { port, env } = require("./config/environment");

// Connect to database
connectDB();

// Start server
const server = app.listen(port, () => {
  console.log(`Server running in ${env} mode on port ${port}`);
});

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
