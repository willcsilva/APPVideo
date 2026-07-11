if (process.env.NODE_ENV !== "test") {
  await import("newrelic");
}
import cors from "cors";
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

import { pool } from "./infra/db.js";
import { config } from "./config.js";
import { authMiddleware } from "./middleware/auth.js";

const app = express();
app.use(cors());
app.use(express.json());

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Verifica saúde do serviço
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: Serviço funcionando
 */

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

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Registrar novo usuário
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: usuario@email.com
 *               password:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       201:
 *         description: Usuário criado com sucesso
 *       409:
 *         description: Usuário já existe
 */
app.post("/auth/register", async (req, res) => {
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

/**
 * @swagger
 * /login:
 *   post:
 *     summary: Realiza login
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: usuario@email.com
 *               password:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       200:
 *         description: Login realizado com sucesso
 *       401:
 *         description: Credenciais inválidas
 */
app.post("/auth/login", async (req, res) => {
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

/**
 * @swagger
 * /me:
 *   get:
 *     summary: Retorna informações do usuário autenticado
 *     tags:
 *       - Auth
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Usuário autenticado
 *       401:
 *         description: Token inválido
 */
app.get("/auth/me", authMiddleware, async (req, res) => {
  return res.status(200).json({
    message: "Token válido",
    user: req.user,
  });
});

export default app;