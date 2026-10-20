const nf = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

export const eur = (n: number) => `€${nf.format(Math.round(n))}`;
export const num = (n: number) => nf.format(Math.round(n));
export const pct = (n: number) => `${Math.round(n * 100)}%`;
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
