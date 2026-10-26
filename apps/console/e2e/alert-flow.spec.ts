import { expect, test } from "@playwright/test";

// The notice hands the operator the webhook URL and token through copy buttons
// and prints the token for manual copying, so the spec reads both from the
// clipboard — the same way a person would.
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

/**
 * The core operator journey, end to end against a real server:
 *
 *   first-run setup -> create a Source -> copy its webhook URL ->
 *   create a Destination -> create a Route -> send a real alert ->
 *   see the event arrive and fan out into a delivery.
 *
 * This is the flow `docs/release/mvp-rc-checklist.md` asks for, and it exists
 * because every layer below it is unit-tested but nothing proved the seams
 * between them work in a browser.
 */

const OWNER = {
  name: "E2E Owner",
  email: "e2e-owner@example.test",
  password: "e2e-password-1234",
};

test.describe.configure({ mode: "serial" });

test("a first-run operator can set up, route, and deliver an alert", async ({ page, request }) => {
  // --- 0. A clean name for every run --------------------------------------
  // The throwaway database is deleted before the server boots, but the run is
  // still the only writer; timestamps keep two consecutive local runs readable.
  const suffix = Date.now();
  // --- 1. First-run setup -------------------------------------------------
  await page.goto("/setup");

  // The app decides setup vs login from the bootstrap query; give it a real
  // assertion rather than assuming the route renders immediately.
  const setupHeading = page.getByText("Create owner account");
  const loginHeading = page.getByText("Login to Tocsin");

  await expect(setupHeading.or(loginHeading)).toBeVisible();

  if (await setupHeading.isVisible()) {
    await page.getByLabel("Name").fill(OWNER.name);
    await page.getByLabel("Email").fill(OWNER.email);
    await page.getByLabel("Password").fill(OWNER.password);
    await page.getByRole("button", { name: "Create owner" }).click();
  } else {
    await page.getByLabel("Email").fill(OWNER.email);
    await page.getByLabel("Password").fill(OWNER.password);
    await page.getByRole("button", { name: "Login" }).click();
  }

  // Setup lands on the dashboard; asserting on navigation proves auth actually
  // took rather than the click merely being accepted.
  await expect(page).toHaveURL(/\/(events|sources|destinations|routes)/, { timeout: 30_000 });

  // --- 2. Create a Source and copy its webhook URL ------------------------
  await page.goto("/sources");

  // Anchor on the page description, which is rendered by the page toolbar
  // alongside its title, rather than on the title itself.
  await expect(page.getByText("Manage inbound webhook senders and secure intake")).toBeVisible({
    timeout: 30_000,
  });
  const sourceDialog = await openDialog(page, "Add", "New Source");

  const sourceName = `E2E source ${suffix}`;
  await sourceDialog.locator('input[name="name"]').fill(sourceName);
  await sourceDialog.getByRole("button", { name: "Create Source" }).click();

  // The token is shown exactly once, in a notice that also carries the webhook
  // URL. Reading it here is the only way an operator can capture it, so the spec
  // captures it the same way rather than reconstructing the URL.
  const createdNotice = page.getByText("Source created successfully");
  await expect(createdNotice).toBeVisible({ timeout: 30_000 });

  const { webhookUrl, token } = await readNoticeSecrets(page);
  expect(webhookUrl).toContain("/api/");

  // --- 3. Create a Destination -------------------------------------------
  await page.goto("/destinations");

  const destinationDialog = await openDialog(page, "Add", "New destination");

  const destinationName = `E2E webhook ${suffix}`;
  await destinationDialog.locator('input[name="name"]').fill(destinationName);

  // A generic webhook destination requires its URL: without one the form refuses
  // to submit and the dialog simply stays open. Nothing has to answer at this
  // address — the assertions below are about routing, not outbound delivery.
  //
  // Use `localhost`, not a reserved TLD like `.test`: the manifest validates the
  // URL and a reserved TLD is rejected as "Invalid URL" at submit time.
  await destinationDialog.getByLabel("Webhook URL").fill("http://localhost:9/e2e-sink");

  await destinationDialog.getByRole("button", { name: "Create destination" }).click();

  await expect(page.getByText(destinationName).first()).toBeVisible({ timeout: 30_000 });

  // --- 4. Create a Route from the Source to the Destination --------------
  // Without this step the event would be stored unmatched: the assertions
  // below exist precisely because intake, matching, and fan-out only meet in
  // the real app.
  await page.goto("/routes");

  const routeDialog = await openDialog(page, "Add", "New route");

  const routeName = `E2E route ${suffix}`;
  await routeDialog.locator('input[name="name"]').fill(routeName);

  // The rule starts empty; add the source condition the way an operator does.
  // Nested ConditionList buttons carry their class in the accessible name.
  await routeDialog.getByRole("button", { name: "Add condition: Source" }).click();

  // The row's select is labelled by its condition class and 1-based index.
  await routeDialog.getByRole("combobox", { name: "Source 1" }).click();
  await page.getByRole("option", { name: sourceName, exact: true }).click();

  // Destinations are a checkbox list rendered inside the dialog's listbox.
  // Click the trigger twice: once to open, once to close after selecting, so
  // the dropdown does not sit over the submit button. Anchor on the trigger's
  // own id: every Radix select trigger also carries aria-haspopup="listbox",
  // so a haspopup selector would match the rule's select fields as well.
  const destinationTrigger = routeDialog.locator("button#destinationIds");
  await destinationTrigger.click();
  await routeDialog.getByRole("option").filter({ hasText: destinationName }).click();
  await destinationTrigger.click();

  await routeDialog.getByRole("button", { name: "Create route" }).click();

  await expect(page.getByText(routeName).first()).toBeVisible({ timeout: 30_000 });

  // --- 5. Deliver a real alert -------------------------------------------
  // POST straight at the token-authenticated webhook the UI handed us, sending
  // the token the way an upstream alerting system must: as a header. The path
  // itself carries no token.
  const response = await request.post(webhookUrl, {
    headers: {
      "content-type": "application/json",
      [WEBHOOK_TOKEN_HEADER]: token,
    },
    data: {
      id: `e2e-${Date.now()}`,
      title: "E2E alert",
      message: "delivered by the browser end-to-end suite",
      severity: "critical",
      status: "firing",
    },
  });

  expect(response.ok(), `webhook POST failed: ${response.status()}`).toBe(true);

  // --- 6. The operator can see the event and its delivery ----------------
  await page.goto("/events");

  const eventRow = page.getByRole("row").filter({ hasText: "E2E alert" });
  await expect(eventRow.first()).toBeVisible({ timeout: 30_000 });

  // A matched route projects a route-match count, so the counts cell must not
  // fall back to the unmatched badge. Asserting the absence is stable: it does
  // not depend on whether the worker has attempted the delivery yet.
  await expect(eventRow.first().getByText("No route matched")).toHaveCount(0);

  // The delivery itself is the fan-out proof. Assert row presence and the
  // target/event pairing, never the final state or attempt count: the target
  // refuses connections, and the worker may sit in pending, running, or failed
  // depending on scheduling.
  await page.goto("/deliveries");

  const deliveryRow = page
    .getByRole("row")
    .filter({ hasText: destinationName })
    .filter({ hasText: "E2E alert" });
  await expect(deliveryRow.first()).toBeVisible({ timeout: 30_000 });
});

/**
 * Read the webhook URL and token the create-notice produces.
 *
 * Both come from the notice's own copy buttons, which is exactly what an
 * operator does. The notice renders the token as selectable text so an operator
 * on a non-secure origin can still copy it by hand; the webhook URL stays in
 * the table cell and the copy button. The clipboard assertion therefore also
 * proves the copy button yields the same value the operator can see.
 *
 * The token is not a query parameter either (`sourceWebhookPath` is just
 * `/api/sources/{id}/webhook`), so it travels as a header — see
 * `WEBHOOK_TOKEN_HEADER`.
 */
async function readNoticeSecrets(page: import("@playwright/test").Page): Promise<{
  webhookUrl: string;
  token: string;
}> {
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());

  await page.getByRole("button", { name: "Copy URL" }).click();
  const webhookUrl = (await clipboard()).trim();

  await page.getByRole("button", { name: "Copy Token" }).click();
  const token = (await clipboard()).trim();

  if (!/^https?:\/\/\S+\/api\/sources\/\S+\/webhook$/.test(webhookUrl)) {
    throw new Error(`copy-URL did not yield a webhook URL, got: ${webhookUrl}`);
  }

  if (token.length === 0) {
    throw new Error("copy-token produced an empty string");
  }

  await expect(page.getByText(token)).toBeVisible();

  return { webhookUrl, token };
}

/**
 * Open a dialog from a toolbar trigger, tolerating the hydration race.
 *
 * The toolbars re-render once hydration finishes, so a single click can land
 * before the handler is attached and be dropped with no error. Retrying the
 * click until the dialog is actually on screen is the difference between a spec
 * that tests the app and one that tests how fast the machine happened to be.
 */
async function openDialog(
  page: import("@playwright/test").Page,
  triggerName: string,
  expectedTitle: string | RegExp,
): Promise<import("@playwright/test").Locator> {
  const dialog = page.getByRole("dialog");

  await expect(async () => {
    await page.getByRole("button", { name: triggerName, exact: true }).click();
    await expect(dialog.getByText(expectedTitle)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  return dialog;
}

/** Header the intake path accepts; see `createWebhookRequestContext`. */
const WEBHOOK_TOKEN_HEADER = "x-tocsin-source-token";
