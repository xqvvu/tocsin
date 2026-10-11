import { describe, expect, it } from "vite-plus/test";

import { localeCookieValue, readLocaleCookie } from "#/i18n/locale-cookie";
import { normalizeLocale, parseAcceptLanguage, resolveLocale } from "#/i18n/locales";

describe("locale resolution", () => {
  it("normalizes supported English and simplified Chinese locale tags", () => {
    expect(normalizeLocale("en")).toBe("en-US");
    expect(normalizeLocale("en-US")).toBe("en-US");
    expect(normalizeLocale("zh")).toBe("zh-Hans");
    expect(normalizeLocale("zh-CN")).toBe("zh-Hans");
    expect(normalizeLocale("zh-SG")).toBe("zh-Hans");
    expect(normalizeLocale("zh-Hans")).toBe("zh-Hans");
  });

  it("uses quality values when parsing Accept-Language", () => {
    expect(parseAcceptLanguage("fr-CA,zh-CN;q=0.8,en-US;q=0.6")).toBe("zh-Hans");
    expect(parseAcceptLanguage("zh-CN;q=0.3,en-US;q=0.9")).toBe("en-US");
  });

  it("prefers the locale cookie over Accept-Language and falls back to English", () => {
    expect(resolveLocale({ cookieLocale: "en-US", acceptLanguage: "zh-CN" })).toBe("en-US");
    expect(resolveLocale({ cookieLocale: null, acceptLanguage: "zh-CN" })).toBe("zh-Hans");
    expect(resolveLocale({ cookieLocale: null, acceptLanguage: "fr-CA" })).toBe("en-US");
  });
});

describe("locale cookie", () => {
  it("reads only supported locale cookie values", () => {
    expect(readLocaleCookie("theme=dark; tocsin_locale=zh-Hans; other=1")).toBe("zh-Hans");
    expect(readLocaleCookie("tocsin_locale=zh-CN")).toBe("zh-Hans");
    expect(readLocaleCookie("tocsin_locale=fr-FR")).toBeNull();
  });

  it("serializes a long-lived path-wide cookie", () => {
    expect(localeCookieValue("zh-Hans")).toBe(
      "tocsin_locale=zh-Hans; Path=/; Max-Age=31536000; SameSite=Lax",
    );
  });
});
