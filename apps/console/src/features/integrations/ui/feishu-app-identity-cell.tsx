import { RiRobot3Line } from "@remixicon/react";

import type { FeishuAppListItem } from "@tocsin/core";

/**
 * Primary column for the Feishu app list.
 *
 * Follows the shared identity-cell shape used by sources and destinations — a
 * bordered icon tile then the name — so the three lists read the same way. A
 * bare name next to an icon tile in every other table looked like a column that
 * had lost its icon.
 *
 * The tile is decorative: `aria-hidden` because the name beside it already
 * carries the meaning, and a screen reader announcing "robot" before every app
 * name would be noise.
 */
export function FeishuAppIdentityCell({ app }: { app: FeishuAppListItem }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="border-border bg-muted/70 flex size-8 shrink-0 items-center justify-center border">
        <RiRobot3Line className="text-muted-foreground size-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold" title={app.name}>
          {app.name}
        </div>
      </div>
    </div>
  );
}
