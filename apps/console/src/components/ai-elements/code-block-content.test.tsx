// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { CodeBlockContent, highlightCode } from "#/components/ai-elements/code-block";

const CODE = '{"status":"ok","attempt":1}';

// The github-light theme paints plain text with this foreground. Raw tokens use
// `inherit`, so its presence means Shiki tokenization reached the markup.
const SHIKI_LIGHT_FOREGROUND = "rgb(36, 41, 46)";

const warmHighlightCache = async () => {
  await new Promise<void>((resolve) => {
    const cached = highlightCode(CODE, "json", () => resolve());

    if (cached) {
      resolve();
    }
  });
};

describe("CodeBlockContent hydration", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders raw tokens on the server even when the highlight cache is warm", async () => {
    await warmHighlightCache();

    const html = renderToString(<CodeBlockContent code={CODE} language="json" />);

    expect(html).toContain("status");
    expect(html).not.toContain(SHIKI_LIGHT_FOREGROUND);
  });

  it("highlights after mount without changing the server-rendered first frame", async () => {
    await warmHighlightCache();

    const { container } = render(<CodeBlockContent code={CODE} language="json" />);

    await waitFor(() => {
      expect(container.innerHTML).toContain(SHIKI_LIGHT_FOREGROUND);
    });
  });

  it("does not reuse a highlight from the previous code value", async () => {
    await warmHighlightCache();

    const { container, rerender } = render(<CodeBlockContent code={CODE} language="json" />);

    await waitFor(() => {
      expect(container.innerHTML).toContain(SHIKI_LIGHT_FOREGROUND);
    });

    rerender(<CodeBlockContent code='{"status":"changed"}' language="json" />);

    expect(container.textContent).toContain("changed");
  });
});
