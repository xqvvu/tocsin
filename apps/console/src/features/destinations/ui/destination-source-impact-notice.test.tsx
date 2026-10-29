// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { DestinationSourceImpactNotice } from "#/features/destinations/ui/destination-source-impact-notice";
import { AppIntlProvider } from "#/i18n/provider";

describe("destination source impact notice", () => {
  afterEach(() => {
    cleanup();
  });

  it("names the alert sources that lose the delivery path", () => {
    render(
      <AppIntlProvider locale="en-US">
        <DestinationSourceImpactNotice
          impact={{
            affectedSourceCount: 2,
            affectedSourceNames: ["Grafana production", "SigNoz staging"],
            coversAllSources: false,
          }}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("2 alert sources affected")).toBeTruthy();
    expect(
      screen.getByText(
        "Alerts from these sources will stop reaching this destination: Grafana production, SigNoz staging",
      ),
    ).toBeTruthy();
  });

  it("says all sources are affected when a route matches every source", () => {
    render(
      <AppIntlProvider locale="en-US">
        <DestinationSourceImpactNotice
          impact={{
            affectedSourceCount: 1,
            affectedSourceNames: ["Grafana production"],
            coversAllSources: true,
          }}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("1 alert source affected")).toBeTruthy();
    expect(
      screen.getByText(
        "An enabled route matches every alert source, so alerts from all sources, including ones added later, will stop reaching this destination",
      ),
    ).toBeTruthy();
  });

  it("collapses long source lists after the fifth name", () => {
    render(
      <AppIntlProvider locale="en-US">
        <DestinationSourceImpactNotice
          impact={{
            affectedSourceCount: 7,
            affectedSourceNames: [
              "Source 1",
              "Source 2",
              "Source 3",
              "Source 4",
              "Source 5",
              "Source 6",
              "Source 7",
            ],
            coversAllSources: false,
          }}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("7 alert sources affected")).toBeTruthy();
    expect(
      screen.getByText(
        "Alerts from these sources will stop reaching this destination: Source 1, Source 2, Source 3, Source 4, Source 5 and 2 more",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Source 6/)).toBeNull();
  });

  it("renders nothing when no source is affected", () => {
    const { container } = render(
      <AppIntlProvider locale="en-US">
        <DestinationSourceImpactNotice
          impact={{
            affectedSourceCount: 0,
            affectedSourceNames: [],
            coversAllSources: false,
          }}
        />
      </AppIntlProvider>,
    );

    expect(container.firstChild).toBeNull();
  });
});
