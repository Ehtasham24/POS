// A distinct accent per category so a cashier finds a product by colour before reading its
// name. Assigned by the category's position in the id-sorted list, so a category keeps its
// colour between visits. Indigo/blue are left out on purpose: that's the app's primary
// colour, which already means "selected/active". Full class strings only (not built from
// fragments), so Tailwind's JIT can see every one of them.
const PALETTE = [
  { dot: "bg-sky-500", bar: "bg-sky-500", soft: "bg-sky-50 dark:bg-sky-500/10", text: "text-sky-700 dark:text-sky-300" },
  { dot: "bg-emerald-500", bar: "bg-emerald-500", soft: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-300" },
  { dot: "bg-amber-500", bar: "bg-amber-500", soft: "bg-amber-50 dark:bg-amber-500/10", text: "text-amber-700 dark:text-amber-300" },
  { dot: "bg-rose-500", bar: "bg-rose-500", soft: "bg-rose-50 dark:bg-rose-500/10", text: "text-rose-700 dark:text-rose-300" },
  { dot: "bg-violet-500", bar: "bg-violet-500", soft: "bg-violet-50 dark:bg-violet-500/10", text: "text-violet-700 dark:text-violet-300" },
  { dot: "bg-teal-500", bar: "bg-teal-500", soft: "bg-teal-50 dark:bg-teal-500/10", text: "text-teal-700 dark:text-teal-300" },
  { dot: "bg-orange-500", bar: "bg-orange-500", soft: "bg-orange-50 dark:bg-orange-500/10", text: "text-orange-700 dark:text-orange-300" },
  { dot: "bg-fuchsia-500", bar: "bg-fuchsia-500", soft: "bg-fuchsia-50 dark:bg-fuchsia-500/10", text: "text-fuchsia-700 dark:text-fuchsia-300" },
  { dot: "bg-lime-500", bar: "bg-lime-500", soft: "bg-lime-50 dark:bg-lime-500/10", text: "text-lime-700 dark:text-lime-300" },
  { dot: "bg-cyan-500", bar: "bg-cyan-500", soft: "bg-cyan-50 dark:bg-cyan-500/10", text: "text-cyan-700 dark:text-cyan-300" },
];

const NEUTRAL = {
  dot: "bg-gray-400",
  bar: "bg-gray-300 dark:bg-gray-600",
  soft: "bg-surface-muted dark:bg-gray-700",
  text: "text-gray-600 dark:text-gray-300",
};

// categoryId -> colour, built once per category list.
export const buildCategoryColors = (categories) => {
  const map = new Map();
  [...categories]
    .sort((a, b) => a.id - b.id)
    .forEach((category, index) => map.set(category.id, PALETTE[index % PALETTE.length]));
  return (categoryId) => map.get(categoryId) || NEUTRAL;
};
