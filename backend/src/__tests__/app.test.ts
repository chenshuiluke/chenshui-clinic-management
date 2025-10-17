import { describe, it } from "mocha";
import { expect } from "chai";
import request from "supertest";
import { getApp } from "./fixtures";

describe("App Routes", () => {
  let app: ReturnType<typeof getApp>;

  before(() => {
    app = getApp();
  });

  describe("GET /healthz", () => {
    it("should return 200 OK for health check", async () => {
      const response = await request(app).get("/healthz");

      expect(response.status).to.equal(200);
      expect(response.text).to.equal("OK");
    });
  });

  describe("GET /", () => {
    it("should return server running message", async () => {
      const response = await request(app).get("/");

      expect(response.status).to.equal(200);
      expect(response.body.message).to.exist;
      expect(response.body.message).to.match(/Server is running/);
    });
  });

  describe("404 Routes", () => {
    it("should return 404 for unknown routes", async () => {
      const response = await request(app).get("/unknown-route");

      expect(response.status).to.equal(404);
    });
  });
});
