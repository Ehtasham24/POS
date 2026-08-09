import { useId } from "react";

// App mark from the "POS Logo" design (claude.ai/design project 40184f18-...): a
// POS-terminal outline (register body + screen slot), a checkmark ("transaction
// confirmed"), and a receipt line — no background badge, just the line art itself, so it
// reads as a mark on its own rather than a boxed icon. Strokes use the app's own
// indigo→violet brand gradient instead of the original design's white-on-badge treatment,
// since there's no longer a dark badge underneath to give white strokes contrast. Inline
// SVG (not a rasterized PNG) so it stays crisp at every size this renders at.
//
// The gradient id must be unique per instance — the sidebar and mobile header versions are
// both mounted at once (one hidden via CSS per breakpoint, not unmounted), and two SVGs in
// the same document sharing one <linearGradient id> would only render correctly.
export default function Logo({ className }) {
  const gradientId = useId();

  return (
    <svg viewBox="20 8 60 70" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>
      </defs>
      <rect
        x="26" y="24" width="48" height="40" rx="8"
        fill="none" stroke={`url(#${gradientId})`} strokeWidth="5"
      />
      <rect
        x="34" y="14" width="32" height="14" rx="6"
        fill="none" stroke={`url(#${gradientId})`} strokeWidth="5"
      />
      <path
        d="M38 46 L47 55 L64 38"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="26" y1="72" x2="74" y2="72"
        stroke={`url(#${gradientId})`} strokeWidth="5" strokeLinecap="round"
      />
    </svg>
  );
}
