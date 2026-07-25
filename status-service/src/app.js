import express from "express";
import cors from "cors";
import pkg from "pg";

const { Client } = pkg;

const app = express();
const port = 3005;

const allowedOrigins =
  process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS
        .split(",")
        .map(origin => origin.trim())
    : [
        "http://localhost:3000",
        "http://localhost:8080",
        "https://appvideo.willow.tec.br"
      ];

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {

      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error("Origin not allowed by CORS")
      );
    }
  })
);
app.use(express.json());

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
  console.error("DB CHECK ERROR:", error);
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