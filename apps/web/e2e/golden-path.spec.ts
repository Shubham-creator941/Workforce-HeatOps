import { expect, test } from "@playwright/test";

test("supervisor golden path preserves meaningful evidence across every view", async ({
  page,
}) => {
  let demoGeometry: unknown;
  page.on("response", async (response) => {
    if (response.url().endsWith("/api/v1/planning-runs/demo")) {
      const body = (await response.json()) as {
        data?: {
          environment?: Array<{
            providerEvidence?: { fortyGuard?: { tileGeometry?: unknown } };
          }>;
        };
      };
      demoGeometry =
        body.data?.environment?.[0]?.providerEvidence?.fortyGuard?.tileGeometry;
    }
  });
  await page.route("https://basemaps.cartocdn.com/**", (route) =>
    route.abort(),
  );
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
  expect(demoGeometry).toEqual({
    type: "Polygon",
    coordinates: [
      [
        [-112.01, 32.99],
        [-111.99, 32.99],
        [-111.99, 33.01],
        [-112.01, 33.01],
        [-112.01, 32.99],
      ],
    ],
  });
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

  await page.getByRole("link", { name: "Mission Control" }).click();
  const map = page.getByRole("application", {
    name: "Interactive thermal zone map",
  });
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute("data-ready", "true");
  await expect(page.getByText("OpenStreetMap")).toBeVisible();
  await expect(
    page.getByText(
      "Basemap unavailable. Verified zone geometry and evidence remain active.",
    ),
  ).toBeVisible();
  const zone = page.getByRole("button", { name: "Select zone-east" });
  await zone.click();
  await expect(zone).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("34.25°C · tile-60m-1")).toBeVisible();
  await expect(page.getByText("East Structure").last()).toBeVisible();
  await page.getByRole("link", { name: "Optimized Plan" }).click();

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

test("live mode requires trusted 2 m wind and shows provider configuration errors", async ({
  page,
}) => {
  await page.goto("/mission");
  await page.getByLabel("Scenario").selectOption("live");
  await expect(
    page.getByRole("region", { name: "Live Provider configuration" }),
  ).toBeVisible();
  await expect(page.getByLabel("Trusted 2 m wind speed")).toBeVisible();
  await expect(
    page.getByLabel("Trusted wind observation timestamp"),
  ).not.toHaveValue("");
  await expect(page.getByLabel("Trusted wind source reference")).toHaveValue(
    "",
  );

  await page.getByRole("button", { name: "Run HeatOps" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "TRUSTED_WIND_CONFIGURATION",
  );
  await expect(page.getByRole("alert")).toContainText(
    "valid trusted 2 m wind speed",
  );

  await page.getByLabel("Trusted 2 m wind speed").fill("1.7");
  await page
    .getByLabel("Trusted wind source reference")
    .fill("onsite-anemometer-observation-42");
  await page.route("**/api/v1/planning-runs", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "FORTYGUARD_CONFIGURATION",
          message:
            "FortyGuard API credentials are not configured on the planning API.",
        },
      }),
    });
  });
  await page.getByRole("button", { name: "Run HeatOps" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "FORTYGUARD_CONFIGURATION",
  );
  await expect(page.getByRole("alert")).toContainText(
    "credentials are not configured",
  );
});
