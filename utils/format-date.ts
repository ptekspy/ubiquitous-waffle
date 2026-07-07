export function formatDate(createdUtc: number | null): string {
  if (!createdUtc) return "Unknown";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(createdUtc * 1000));
}
