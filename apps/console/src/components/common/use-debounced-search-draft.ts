import * as React from "react";

/**
 * Search text is typed locally and committed after a pause.
 *
 * Writing every keystroke to the URL re-renders the input from the committed
 * value (so a trailing space disappears mid-word), fires a request per key on
 * server-backed lists, and adds a history entry per pause. The draft keeps the
 * operator's exact text while the debounce collapses a burst of typing into one
 * navigation.
 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The draft lives with the filter bar, not inside the input, because "clear
 * filters" and the active-query chip both clear the committed value. Clearing
 * has to cancel an uncommitted draft at the same time, and only this scope sees
 * both.
 */
export function useDebouncedSearchDraft(value: string, commit: (next: string) => void) {
  const [draft, setDraft] = React.useState(value);
  // The last value this draft sent to the URL. An incoming `value` that matches
  // it is our own commit echoing back, so it must not overwrite characters the
  // operator typed while the navigation was in flight.
  const committed = React.useRef(value);
  const timer = React.useRef<number | null>(null);
  const commitRef = React.useRef(commit);

  React.useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  React.useEffect(() => {
    if (value === committed.current) {
      return;
    }

    // An external change — browser history, or a filter the operator applied
    // elsewhere — wins over an uncommitted draft.
    committed.current = value;
    setDraft(value);
    cancelPending(timer);
  }, [value]);

  React.useEffect(() => () => cancelPending(timer), []);

  function update(next: string): void {
    setDraft(next);
    cancelPending(timer);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      committed.current = next;
      commitRef.current(next);
    }, SEARCH_DEBOUNCE_MS);
  }

  function clear(): void {
    cancelPending(timer);
    committed.current = "";
    setDraft("");
  }

  return { draft, update, clear };
}

function cancelPending(timer: React.MutableRefObject<number | null>): void {
  if (timer.current !== null) {
    window.clearTimeout(timer.current);
    timer.current = null;
  }
}
