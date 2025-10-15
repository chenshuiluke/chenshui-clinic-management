import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// Basic middleware
app.use(express.json());

// Simple health check route for ECS/ALB
app.get("/healthz", (req, res) => {
  res.status(200).send("OK");
});

// Example route
app.get("/", (req, res) => {
  res.json({ message: "Server is running 🚀" });
});

// Start the server
if (process.env.PORT == null) {
  console.error("PORT environment variable is not set");
  process.exit(1);
}

const PORT = parseInt(process.env.PORT) || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is listening on port ${PORT}`);
});
