/**
 * Smoke test senza server in ascolto: Supertest + app Express.
 * Richiede SESSION_SECRET (impostata sotto se assente).
 */
"use strict";

if (!process.env.SESSION_SECRET || String(process.env.SESSION_SECRET).trim().length < 20) {
  process.env.SESSION_SECRET = "smoke-test-session-secret-min-32-chars!!";
}
process.env.NODE_ENV = process.env.NODE_ENV || "test";

require("../src/config/loadEnv").loadEnv();

const { test, describe } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");

const app = require("../src/app");

describe("smoke API", () => {
  test("GET /api/health → 200 JSON", async () => {
    const res = await request(app).get("/api/health");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body && res.body.status, "ok");
  });

  test("GET /api/system/health → 200 JSON", async () => {
    const res = await request(app).get("/api/system/health");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body && res.body.status, "ok");
  });

  test("POST /api/auth/login senza body → 4xx (route raggiungibile)", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    assert.ok(res.status >= 400 && res.status < 500, `status atteso 4xx, got ${res.status}`);
  });
});
