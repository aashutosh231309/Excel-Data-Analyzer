type ClassValue = string | number | null | false | undefined;

/** Minimal class name joiner: keeps components free of template-string noise. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
