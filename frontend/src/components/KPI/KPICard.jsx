// components/KPI/KPICard.jsx

import { TrendingUp } from "lucide-react";

export default function KPICard({
  title,
  value,
  color,
}) {
  return (
    <div
      className="
      bg-white dark:bg-slate-900
      border
      border-slate-300 dark:border-slate-800
      rounded-2xl
      p-5
      "
    >
      <p className="text-slate-500 dark:text-slate-400 text-sm">
        {title}
      </p>

      <div className="flex items-center justify-between mt-2">
        <h2
          className={`text-3xl font-bold ${color}`}
        >
          {value}
        </h2>

        <TrendingUp
          className="text-green-500"
          size={22}
        />
      </div>
    </div>
  );
}