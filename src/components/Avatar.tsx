/**
 * Shared "who is this" visual: a real picture when one's been uploaded,
 * otherwise initials on a solid accent circle — never a generic silhouette.
 * `name` should already be the best available label (username, falling
 * back to email) so this component doesn't need to know that fallback
 * chain itself.
 */
export function initialsFor(name: string): string {
  const base = name.includes("@") ? name.split("@")[0] : name;
  const tokens = base.split(/[\s._-]+/).filter(Boolean);
  if (tokens.length === 0) return "?";
  if (tokens.length === 1) {
    return tokens[0].length >= 2
      ? tokens[0].slice(0, 2).toUpperCase()
      : tokens[0][0].toUpperCase();
  }
  return (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase();
}

export default function Avatar({
  name,
  avatarUrl,
  size = 28,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        className="flex-shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className="flex flex-shrink-0 items-center justify-center rounded-full bg-saffron-500 font-semibold text-onaccent"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initialsFor(name)}
    </span>
  );
}
