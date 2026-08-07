import { useEffect, useState } from "react";

// Returns `value`, but only updates (and therefore only triggers effects/re-renders
// keyed off it) `delay`ms after the caller stops changing it. Use this to avoid firing
// an API call on every keystroke in a search box.
export default function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);

  return debounced;
}
