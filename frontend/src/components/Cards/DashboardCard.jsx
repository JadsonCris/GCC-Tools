
export default function DashboardCard({
  title,
  children,
}) {
  return (
    <div
      className="
      bg-slate-900
      rounded-2xl
      border
      border-slate-800
      p-6
      shadow-lg
      "
    >
      <h3 className="text-lg font-semibold mb-4">
        {title}
      </h3>

      {children}
    </div>
  );
}