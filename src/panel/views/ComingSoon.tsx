export function ComingSoon({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
      <div className="text-sm font-semibold text-zinc-300">{title}</div>
      <div className="max-w-xs text-xs text-zinc-500">
        This view lands in {phase}. The collector is already capturing the underlying data — it just
        isn't visualized here yet.
      </div>
    </div>
  );
}
