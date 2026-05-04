export function formatCurrency(value: number, currency = "$") {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

export function formatPercent(value: number, digits = 2) {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(value)} %`;
}

export function signed(value: number, suffix = "") {
  const sign = value > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)}${suffix}`;
}
