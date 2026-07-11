const express = require("express");
const cors = require("cors");
const { Client } = require("pg");

const app = express();
const port = 3005;

app.use(cors());

// const allowedOrigins = [
//   "http://localhost:8080",
//   "http://127.0.0.1:8080"
// ];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error("Origin não permitida pelo CORS")
      );
    },
    methods: [
      "GET",
      "POST",
      "PUT",
      "DELETE",
      "OPTIONS"
    ],
    allowedHeaders: [
      "Content-Type",
      "Authorization"
    ],
    credentials: true
  })
);

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "video_db",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres"
};

async function checkDatabase() {
  const client = new Client(dbConfig);

  try {
    await client.connect();
    await client.query("SELECT 1");
    await client.end();

    return "ok";
  } catch (error) {
    return "error";
  }
}

app.get("/status", async (req, res) => {
  const dbStatus = await checkDatabase();

  res.status(200).json({
    status: dbStatus === "ok" ? "ok" : "degraded",
    services: {
      api: "ok",
      database: dbStatus
    }
  });
});

app.listen(port, () => {
  console.log(
    `Status Service rodando na porta ${port}`
  );
});