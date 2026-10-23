import { stickyActionsColumnClassName } from "#/components/common/operations-table-layout";

export const deliveriesPageSize = 20;
// The nine columns have to fit the same 982px viewport as Events at 1280x900;
// at min-w-320 the updated column sat entirely outside the viewport.
export const deliveriesTableMinWidthClassName = "min-w-240";

export function deliveriesColumnClassName(columnId: string): string | null {
  switch (columnId) {
    case "target":
      return "w-[14%]";
    case "event":
      return "w-[17%]";
    case "state":
      return "w-[7%]";
    case "attempts":
      return "w-[6%]";
    case "receipt":
      // A message id is short but unknown-width, so the cell clips and keeps
      // the full value in its tooltip and copy action.
      return "w-[11%] truncate";
    case "next":
      // A cross-day retry renders a full date and time (~112px at 11px). The
      // column cannot be that wide at 1280, so clip it with an ellipsis: the
      // date stays readable at the start of the value, and the full timestamp
      // remains in the cell's `title`. Without the clip the text paints over
      // the adjacent "last error" column.
      return "w-[10%] truncate";
    case "lastError":
      return "w-[15%]";
    case "updated":
      return "w-[11%]";
    case "actions":
      return `${stickyActionsColumnClassName} w-[9%] min-w-24`;
    default:
      return null;
  }
}
