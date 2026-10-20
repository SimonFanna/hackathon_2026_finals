const nf = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

export const eur = (n: number) => `€${nf.format(Math.round(n))}`;
export const num = (n: number) => nf.format(Math.round(n));
export const tonnes = (kg: number) => `${(kg / 1000).toFixed(1)} t`;
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** "a", "a and b", "a, b and c" */
export function naturalList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
