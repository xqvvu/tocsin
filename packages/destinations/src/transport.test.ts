import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_DESTINATION_TIMEOUT_MS,
  DestinationTimeoutError,
  createTimeoutFetch,
  isTimeoutError,
} from "#destinations/transport";
import type { FetchLike } from "#destinations/types";

describe("destination transport deadline", () => {
  it("uses ten seconds as the default deadline", () => {
    expect(DEFAULT_DESTINATION_TIMEOUT_MS).toBe(10_000);
  });

  it("passes an abort signal and rejects a fetch that never settles", async () => {
    let seenSignal: AbortSignal | null | undefined;
    const hangingFetch: FetchLike = (_url, init) => {
      seenSignal = init.signal;
      return new Promise(() => {});
    };

    await expect(
      createTimeoutFetch(hangingFetch, 10)("https://relay.example.test/tocsin", { method: "POST" }),
    ).rejects.toMatchObject({
      name: "TimeoutError",
      message: "Destination request timed out after 10ms",
    });
    expect(seenSignal).toBeInstanceOf(AbortSignal);
  });

  it("rejects a body read that never finishes", async () => {
    const fetchLike: FetchLike = async () => ({
      ok: true,
      status: 200,
      text: () => new Promise<string>(() => {}),
    });

    const response = await createTimeoutFetch(fetchLike, 10)("https://relay.example.test", {});

    await expect(response.text()).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("leaves a completed response readable within the deadline", async () => {
    const fetchLike: FetchLike = async () => ({
      ok: true,
      status: 202,
      text: async () => "accepted",
    });

    const response = await createTimeoutFetch(fetchLike, 50)("https://relay.example.test", {});

    await expect(response.text()).resolves.toBe("accepted");
    expect(response).toMatchObject({ ok: true, status: 202 });
  });

  it("returns the original fetch when the deadline is disabled", () => {
    const fetchLike: FetchLike = async () => ({
      ok: true,
      status: 200,
      text: async () => "",
    });

    expect(createTimeoutFetch(fetchLike, 0)).toBe(fetchLike);
  });
});

describe("isTimeoutError", () => {
  it("recognizes its own error, runtime timeout errors, and wrapped causes", () => {
    expect(isTimeoutError(new DestinationTimeoutError(10_000))).toBe(true);
    expect(isTimeoutError(new DOMException("aborted", "TimeoutError"))).toBe(true);
    expect(
      isTimeoutError(
        Object.assign(new Error("wrapped"), {
          cause: new DOMException("aborted", "TimeoutError"),
        }),
      ),
    ).toBe(true);
  });

  it("keeps ordinary transport errors and non-errors out", () => {
    expect(isTimeoutError(new Error("socket closed"))).toBe(false);
    expect(isTimeoutError(new DOMException("aborted", "AbortError"))).toBe(false);
    expect(isTimeoutError("timeout")).toBe(false);
    expect(isTimeoutError(null)).toBe(false);
  });
});
