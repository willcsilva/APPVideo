export const config = {
  port: Number(process.env.PORT || 3001),

  dbHost: process.env.DB_HOST,
  dbPort: Number(process.env.DB_PORT || 5432),
  dbName: process.env.DB_NAME,
  dbUser: process.env.DB_USER,
  dbPassword: process.env.DB_PASSWORD,

  jwtSecret: process.env.JWT_SECRET || "super-secret-dev-key",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
};