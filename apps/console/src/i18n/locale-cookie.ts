import { defaultLocale, normalizeLocale, type AppLocale } from "#/i18n/locales";

export const localeCookieName = "tocsin_locale";

export function readLocaleCookie(cookieHeader: string | null | undefined): AppLocale | null {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.trim().split("=");

    if (name === localeCookieName) {
      const value = safeDecodeCookieValue(valueParts.join("="));

      return normalizeLocale(value);
    }
  }

  return null;
}

export function localeCookieValue(locale: AppLocale): string {
  return `${localeCookieName}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function writeLocaleCookie(locale: AppLocale): void {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = localeCookieValue(locale);
}

export function readBrowserLocale(): AppLocale {
  if (typeof navigator === "undefined") {
    return defaultLocale;
  }

  const locale =
    navigator.languages.map(normalizeLocale).find((value) => value !== null) ??
    normalizeLocale(navigator.language);

  return locale ?? defaultLocale;
}

function safeDecodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
