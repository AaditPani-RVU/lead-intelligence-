interface Props {
  classification: string | null;
  reasoning?: string | null;
  size?: "sm" | "lg";
}

const STYLES: Record<string, { bg: string; text: string; label: string }> = {
  Hot:  { bg: "bg-red-100",   text: "text-red-700",   label: "🔥 Hot"  },
  Warm: { bg: "bg-amber-100", text: "text-amber-700", label: "🌤 Warm" },
  Cold: { bg: "bg-blue-100",  text: "text-blue-700",  label: "🧊 Cold" },
  Spam: { bg: "bg-gray-100",  text: "text-gray-500",  label: "🚫 Spam" },
};

export default function ClassificationBadge({ classification, reasoning, size = "sm" }: Props) {
  const style = classification ? (STYLES[classification] ?? STYLES["Cold"]) : { bg: "bg-gray-100", text: "text-gray-400", label: "—" };
  const sizeClasses = size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs";

  return (
    <span
      className={`inline-block rounded-full font-semibold whitespace-nowrap cursor-default ${sizeClasses} ${style.bg} ${style.text}`}
      title={reasoning ?? undefined}
    >
      {style.label}
    </span>
  );
}
