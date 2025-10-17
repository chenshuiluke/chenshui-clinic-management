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

      expect(response.status).to.equal(200, `Expected status 200 but got ${response.status}. Response text: ${response.text}`);
      expect(response.text).to.equal("OK", `Expected response text "OK" but got "${response.text}"`);
    });
  });

  describe("GET /", () => {
    it("should return server running message", async () => {
      const response = await request(app).get("/");

      expect(response.status).to.equal(200, `Expected status 200 but got ${response.status}. Response body: ${JSON.stringify(response.body)}`);
      expect(response.body.message, `Expected message field to exist in response. Response body: ${JSON.stringify(response.body)}`).to.be.ok;
      expect(response.body.message).to.match(/Server is running/, `Expected message to match "Server is running" but got "${response.body.message}"`);
    });
  });

  describe("404 Routes", () => {
    it("should return 404 for unknown routes", async () => {
      const response = await request(app).get("/unknown-route");

      expect(response.status).to.equal(404, `Expected status 404 for unknown route but got ${response.status}. Response body: ${JSON.stringify(response.body)}`);
    });
  });
});
