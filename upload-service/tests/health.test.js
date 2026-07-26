import { jest } from "@jest/globals";
import request from "supertest";

const mockQuery = jest.fn();

jest.unstable_mockModule("../src/infra/db.js", () => ({
  pool: {
    query: mockQuery
  }
}));

const { default: app } =
  await import("../src/app.js");

describe("Upload Service", () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("GET /health retorna status ok", async () => {

    mockQuery.mockResolvedValue({});

    const response =
      await request(app)
        .get("/health");

    expect(response.statusCode)
      .toBe(200);

    expect(response.body.status)
      .toBe("ok");

  });

});