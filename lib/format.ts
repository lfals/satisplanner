import type { ItemForm } from "./data/types";

export function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

export function formatRate(value: number, form: ItemForm): string {
  const amount = formatNumber(value);
  return form === "fluid" ? `${amount} m³/min` : `${amount}/min`;
}

export function formatPower(value: number): string {
  return `${formatNumber(value, 1)} MW`;
}
