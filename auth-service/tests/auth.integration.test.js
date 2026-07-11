import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import pkg from "pg";

const { Pool } = pkg;

process.env.NODE_ENV = "test";
process.env.DB_HOST = "localhost";
process.env.DB_PORT = "5433";
process.env.DB_NAME = "video_test";
process.env.DB_USER = "test";
process.env.DB_PASSWORD = "test123";
process.env.JWT_SECRET = "jwt-test-secret";
process.env.JWT_EXPIRES_IN = "1h";

const testPool = new Pool({
  host: "localhost",
  port: 5433,
  database: "video_test",
  user: "test",
  password: "test123",
});

beforeAll(async () => {
  await testPool.query("DELETE FROM users");

  const passwordHash = await bcrypt.hash("123456", 10);

  await testPool.query(
    `
    INSERT INTO users (id, email, password_hash)
    VALUES ($1, $2, $3)
    `,
    [uuidv4(), "test.integration@fiap.com", passwordHash]
  );
});

const { default: app } = await import("../src/app.js");

describe("Auth Integration Test", () => {
  test("login deve funcionar com banco real", async () => {
    const response = await request(app)
      .post("/auth/login")
      .send({
        email: "test.integration@fiap.com",
        password: "123456"
      });

    expect(response.status).toBe(200);
    expect(response.body.access_token).toBeDefined();
  }, 10000);
});

afterAll(async () => {
  await testPool.query("DELETE FROM users");
  await testPool.end();
});