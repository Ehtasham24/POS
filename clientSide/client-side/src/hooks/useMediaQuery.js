import { useEffect, useState } from "react";

// For the rare layout switch that has to mount different components, not just restyle one
// (the register mounts its cart as either a side panel or a bottom sheet — never both, or
// two live checkout panels would each react to the same hotkeys). Everything else should
// stay plain Tailwind breakpoints.
export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
