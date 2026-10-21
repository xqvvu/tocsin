import { stickyActionsColumnClassName } from "#/components/common/operations-table-layout";

export const deliveriesPageSize = 20;
// The eight columns have to fit the same 982px viewport as Events at 1280x900;
// at min-w-320 the updated column sat entirely outside the viewport.
export const deliveriesTableMinWidthClassName = "min-w-240";

export function deliveriesColumnClassName(columnId: string): string | null {
  switch (columnId) {
    case "target":
      return "w-[16%]";
    case "event":
      return "w-[19%]";
    case "state":
      return "w-[8%]";
    case "attempts":
      return "w-[7%]";
    case "next":
      return "w-[8%]";
    case "lastError":
      return "w-[22%]";
    case "updated":
      return "w-[11%]";
    case "actions":
      return `${stickyActionsColumnClassName} w-[9%] min-w-24`;
    default:
      return null;
  }
}
