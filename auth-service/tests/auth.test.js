import { jest } from "@jest/globals";
import request from "supertest";

jest.unstable_mockModule("bcryptjs", () => ({
  default: {
    compare: async () => true,
    hash: async () => "fake_hash"
  }
}));

jest.unstable_mockModule("../src/infra/db.js", () => ({
  pool: {
    connect: async () => ({
      query: async () => ({
        rowCount: 1,
        rows: [
          {
            id: "123",
            email: "will.auth@fiap.com",
            password_hash: "hash_fake"
          }
        ]
      }),
      release: () => {}
    })
  }
}));

const { default: app } = await import("../src/app.js");

describe("Auth Service", () => {
  test("login deve retornar token", async () => {
    const response = await request(app)
      .post("/auth/login")
      .send({
        email: "will.auth@fiap.com",
        password: "123456"
      });

    expect(response.status).toBe(200);
    expect(response.body.access_token).toBeDefined();
  });
});