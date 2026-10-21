import * as React from "react";
import { IntlProvider } from "use-intl";

import type { AppLocale } from "#/i18n/locales";
import { getMessages } from "#/i18n/messages";
import { fallbackTimeZone } from "#/i18n/time-zone";

export interface AppIntlProviderProps {
  children: React.ReactNode;
  locale: AppLocale;
  /**
   * Pins "now" for `useNow()` consumers. Production leaves it unset so the
   * clock comes from the browser; tests pass a fixed instant when a rendered
   * decision depends on today's date, such as cross-day retry timestamps.
   */
  now?: Date;
  timeZone?: string;
}

export function AppIntlProvider({
  children,
  locale,
  now,
  timeZone = fallbackTimeZone,
}: AppIntlProviderProps) {
  return (
    <IntlProvider locale={locale} messages={getMessages(locale)} now={now} timeZone={timeZone}>
      {children}
    </IntlProvider>
  );
}
