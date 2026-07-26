import request from "supertest";
import app from "../src/app.js";

describe("Status Service", () => {

  test("GET /status retorna 200", async () => {

    const response = await request(app)
      .get("/status");

    expect(response.statusCode).toBe(200);

    expect(response.body).toHaveProperty("status");

    expect(response.body).toHaveProperty("services");

  });

});