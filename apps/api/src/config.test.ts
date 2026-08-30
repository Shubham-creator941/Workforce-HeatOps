import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { loadConfig } from "./config.js";

describe("API configuration", () => {
  it("supports a clean development runtime for the checked-in demo route", () => {
    expect(loadConfig({ NODE_ENV: "development" }).DATABASE_URL).toBe(
      "mysql://heatops:heatops_local@localhost:3306/workforce_heatops",
    );
  });

  it("still requires an explicit database URL in production", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(ZodError);
  });
});
