/**
 * The Settings "UI" tab stacks the operational overview, the runtime facts,
 * and the preferences form in one column. At 390×844 that stack is taller than
 * the viewport (measured 863px content in a 651px panel), and the panel used to
 * clip the overflow without a scroll container: the last runtime facts and the
 * save button were unreachable by wheel or touch.
 *
 * Below `sm` the active panel owns the scroll. At `sm` and above the stack fits
 * the desktop layout, so the original fixed-height composition stays.
 */
export const settingsUiPanelClassName =
  "flex min-h-0 flex-col gap-4 overflow-y-auto sm:overflow-hidden";

/**
 * The preferences form fills the remaining desktop height. Inside the mobile
 * scroll container it must keep its natural height instead of shrinking to a
 * slit, otherwise each field is only visible while focused.
 */
export const settingsPreferencesPanelClassName =
  "border-border flex min-h-0 min-w-0 flex-none flex-col overflow-hidden border py-3 sm:flex-1";
