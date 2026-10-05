// How big the app's text (and with it, everything sized in rem: spacing, buttons, icons) is on
// this device. Set on <html>, so every Tailwind size scales together. "lg" is the size the app
// was designed at; the others step down for small phones, or up for reading at a distance.
// Kept per device (localStorage), like the theme — the phone at the counter and the PC in the
// back room each keep their own.
export const TEXT_SIZES = [
  { key: "xs", label: "XS", percent: 75 },
  { key: "sm", label: "S", percent: 85 },
  { key: "md", label: "M", percent: 92.5 },
  { key: "lg", label: "L", percent: 100 },
  { key: "xl", label: "XL", percent: 112.5 },
];
export const DEFAULT_TEXT_SIZE = "lg";
export const TEXT_SIZE_EVENT = "pos:text-size";

const STORAGE_KEY = "pos-text-size";
const byKey = (key) => TEXT_SIZES.find((size) => size.key === key);

export const getTextSize = () => {
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {}
  return byKey(stored) ? stored : DEFAULT_TEXT_SIZE;
};

export const applyTextSize = (key = getTextSize()) => {
  document.documentElement.style.fontSize = `${(byKey(key) || byKey(DEFAULT_TEXT_SIZE)).percent}%`;
};

export const setTextSize = (key) => {
  if (!byKey(key)) return;
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {}
  applyTextSize(key);
  window.dispatchEvent(new CustomEvent(TEXT_SIZE_EVENT, { detail: key }));
};
