"use client";

export type DayCounts = { Express: number; FuneFlex: number };

type ShipmentCalendarProps = {
  visibleMonth: Date;
  selectedDate: string;
  countsByDate: Record<string, DayCounts>;
  onSelectDate: (date: string) => void;
  onChangeMonth: (delta: number) => void;
};

const WEEKDAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

const MONTH_LABELS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Monday = 0 ... Sunday = 6 (Argentina week convention)
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

type Cell = { date: Date; key: string; inMonth: boolean };

export default function ShipmentCalendar({
  visibleMonth,
  selectedDate,
  countsByDate,
  onSelectDate,
  onChangeMonth,
}: ShipmentCalendarProps) {
  const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const totalDays = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0
  ).getDate();
  const leadingBlanks = mondayIndex(first);
  const todayKey = toDateKey(new Date());

  const cells: Cell[] = [];

  for (let i = leadingBlanks; i > 0; i--) {
    const d = new Date(first);
    d.setDate(d.getDate() - i);
    cells.push({ date: d, key: toDateKey(d), inMonth: false });
  }
  for (let day = 1; day <= totalDays; day++) {
    const d = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day);
    cells.push({ date: d, key: toDateKey(d), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    const d = new Date(last);
    d.setDate(d.getDate() + 1);
    cells.push({ date: d, key: toDateKey(d), inMonth: false });
  }

  return (
    <div className="glass-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onChangeMonth(-1)}
          aria-label="Mes anterior"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/5 hover:text-white"
        >
          ‹
        </button>
        <span className="text-sm font-semibold capitalize text-white">
          {MONTH_LABELS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
        </span>
        <button
          type="button"
          onClick={() => onChangeMonth(1)}
          aria-label="Mes siguiente"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/5 hover:text-white"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-white/40">
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={i}>{label}</div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const counts = countsByDate[cell.key];
          const total = (counts?.Express ?? 0) + (counts?.FuneFlex ?? 0);
          const selected = cell.key === selectedDate;
          const isToday = cell.key === todayKey;

          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => onSelectDate(cell.key)}
              className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-xs transition-colors ${
                selected
                  ? "bg-[#E0457B] font-semibold text-white"
                  : cell.inMonth
                    ? "text-white/80 hover:bg-white/5"
                    : "text-white/25 hover:bg-white/5"
              } ${isToday && !selected ? "ring-1 ring-inset ring-white/30" : ""}`}
            >
              <span>{cell.date.getDate()}</span>
              {total > 0 && (
                <span
                  className={`text-[9px] font-bold tabular-nums ${
                    selected ? "text-white/90" : "text-[#E0457B]"
                  }`}
                >
                  {total}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
