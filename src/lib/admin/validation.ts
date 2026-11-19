export type FieldErrors = Record<string, string>;

export function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function asBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[‌\s_]+/g, "-")
    .replace(/[^a-z0-9آ-ی-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function hasFieldErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function toFarsiDigits(value: string): string {
  return value.replace(/[0-9]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
}
