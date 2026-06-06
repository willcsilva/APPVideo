if (process.env.NODE_ENV !== "test") {
  await import("newrelic");
}

import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

import { pool } from "./infra/db.js";
import { config } from "./config.js";
import { authMiddleware } from "./middleware/auth.js";

const app = express();
app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.status(200).json({ status: "ok" });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      details: error.message,
    });
  }
});

app.post("/register", async (req, res) => {
  const client = await pool.connect();

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "email e password são obrigatórios",
      });
    }

    const existingUser = await client.query(
      `SELECT id FROM users WHERE email = $1`,
      [email]
    );

    if (existingUser.rowCount > 0) {
      return res.status(409).json({
        error: "Usuário já existe",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    await client.query(
      `
      INSERT INTO users (id, email, password_hash)
      VALUES ($1::uuid, $2::varchar, $3::varchar)
      `,
      [userId, email, passwordHash]
    );

    return res.status(201).json({
      message: "Usuário criado com sucesso",
      user_id: userId,
      email,
    });
  } catch (error) {
    console.error("Erro no /register:", error);
    return res.status(500).json({
      error: "Erro ao registrar usuário",
      details: error.message,
    });
  } finally {
    client.release();
  }
});

app.post("/login", async (req, res) => {
  const client = await pool.connect();

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "email e password são obrigatórios",
      });
    }

    const result = await client.query(
      `
      SELECT id, email, password_hash
      FROM users
      WHERE email = $1
      LIMIT 1
      `,
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        error: "Credenciais inválidas",
      });
    }

    const user = result.rows[0];

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({
        error: "Credenciais inválidas",
      });
    }

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
      },
      config.jwtSecret,
      {
        expiresIn: config.jwtExpiresIn,
      }
    );

    return res.status(200).json({
      message: "Login realizado com sucesso",
      access_token: token,
      token_type: "Bearer",
      expires_in: config.jwtExpiresIn,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Erro no /login:", error);
    return res.status(500).json({
      error: "Erro ao autenticar usuário",
      details: error.message,
    });
  } finally {
    client.release();
  }
});

app.get("/me", authMiddleware, async (req, res) => {
  return res.status(200).json({
    message: "Token válido",
    user: req.user,
  });
});

export default app;