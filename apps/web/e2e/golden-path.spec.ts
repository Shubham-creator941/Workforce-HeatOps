import { expect, test } from "@playwright/test";

test("supervisor golden path preserves meaningful evidence across every view", async ({
  page,
}) => {
  await page.goto("/mission");
  await expect(
    page.getByRole("heading", { name: "Phoenix Riverside Build" }),
  ).toBeVisible();
  await expect(page.getByLabel("Scenario")).toHaveValue("demo");
  await expect(
    page.getByText("Trusted 2 m wind", { exact: false }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Run HeatOps" }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(
    page.getByRole("heading", { name: "Optimized Plan" }),
  ).toBeVisible();
  await expect(page.getByText("Exterior wall set").first()).toBeVisible();
  await expect(page.getByText("Why did HeatOps do this?")).toBeVisible();
  await expect(page.getByText("27.125°C", { exact: false })).toBeVisible();
  await expect(
    page.getByText("AI explanation of persisted deterministic results", {
      exact: false,
    }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Evidence", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Evidence", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Estimated Outdoor WBGT", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Continuous work allowed", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("NIOSH 2016-106")).toBeVisible();

  await page.getByRole("link", { name: "Alerts" }).click();
  await expect(page.getByRole("heading", { name: "Alerts" })).toBeVisible();
  await expect(page.getByText("No action-required alerts")).toBeVisible();

  await page.getByRole("link", { name: "Reports" }).click();
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await expect(page.getByText("Demo Evidence", { exact: true })).toBeVisible();
  await expect(page.getByText("1 assignment(s) · 1 zone(s)")).toBeVisible();

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Scientific controls are locked")).toBeVisible();
  await expect(page.getByText("CP_SAT_SLOTS_V1")).toBeVisible();
});
