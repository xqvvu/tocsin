import { stickyActionsColumnClassName } from "#/components/common/operations-table-layout";

export const eventsPageSize = 20;
// Keep the six columns inside the 982px table viewport measured at 1280x900
// with the sidebar expanded. A wider floor pushes the received column under
// the sticky actions column, which the operator cannot scroll back into view.
export const eventsTableMinWidthClassName = "min-w-230";

export function eventsColumnClassName(columnId: string): string | null {
  switch (columnId) {
    case "event":
      return "w-[32%]";
    case "source":
      return "w-[12%]";
    case "state":
      return "w-[10%]";
    case "deliveries":
      return "w-[19%]";
    case "received":
      return "w-[17%]";
    case "actions":
      return `${stickyActionsColumnClassName} w-[10%] min-w-24`;
    default:
      return null;
  }
}
