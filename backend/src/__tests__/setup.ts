import { before, beforeEach } from "mocha";
import { setupTestEnvironment, clearDatabase, getOrm } from "./fixtures";

// Global setup - runs once before all test files
before(async function () {
  await setupTestEnvironment();
});

// Global beforeEach - clears database before each test
beforeEach(async function () {
  await clearDatabase(getOrm());
});
