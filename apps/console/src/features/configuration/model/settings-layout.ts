/**
 * The Settings "UI" tab stacks the operational overview, the writable delivery
 * and account-security controls, the runtime facts, worker health, storage
 * facts, and the preferences form in one column.
 *
 * Account security sits directly after delivery pause, before the read-only
 * diagnostics: "sign out other devices" is incident response and has to be on
 * the first screen at 1440×900, not behind a scroll past runtime and storage
 * facts.
 *
 * The stack is taller than the panel at both 390×844 and 1440×900. It used to
 * clip the overflow at `sm` and above because it was assumed to fit once the
 * desktop layout was wide enough; adding the account-security panel made the
 * preferences form collapse to a slit there. The UI tab therefore owns the
 * scroll at every breakpoint instead of only below `sm`.
 */
export const settingsUiPanelClassName = "flex min-h-0 flex-col gap-4 overflow-y-auto";

/**
 * The preferences form keeps its natural height inside the scroll container.
 *
 * Growing to fill the remaining height (`flex-1`) only worked while the stack
 * fit the panel; inside a scroller it would shrink instead, because the panel
 * uses `min-h-0` and clips. Every other panel on this tab is natural height.
 */
export const settingsPreferencesPanelClassName =
  "border-border flex min-h-0 min-w-0 flex-none flex-col overflow-hidden border py-3";
