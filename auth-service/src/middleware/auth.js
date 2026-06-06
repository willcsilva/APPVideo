import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "minha-chave-jwt-dev";

export function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token ausente ou inválido" });
    }

    const token = authHeader.replace("Bearer ", "").trim();

    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded;

    return next();
  } catch (error) {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
}