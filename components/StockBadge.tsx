export default function StockBadge({ stock }: { stock: number }) {
  const color =
    stock === 0
      ? "bg-red-500/20 text-red-400 border-red-500/30"
      : stock <= 5
        ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
        : "bg-green-500/20 text-green-400 border-green-500/30";

  return (
    <span
      className={`inline-flex min-w-[2.5rem] items-center justify-center rounded-full border px-2.5 py-0.5 text-sm font-semibold tabular-nums ${color}`}
    >
      {stock}
    </span>
  );
}
