export function numberFormat(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}
