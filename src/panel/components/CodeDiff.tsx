interface CodeDiffProps {
  before: string;
  after: string;
  language?: string;
}

/** Minimal before/after diff with red/green gutters. */
export function CodeDiff({ before, after, language }: CodeDiffProps) {
  return (
    <div className="overflow-hidden rounded border border-zinc-800 font-mono text-[10px] leading-relaxed">
      {language && (
        <div className="border-b border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[9px] uppercase tracking-wide text-zinc-500">
          {language}
        </div>
      )}
      <Block sign="-" text={before} className="bg-rose-500/10 text-rose-200" markClass="text-rose-400" />
      <Block sign="+" text={after} className="bg-emerald-500/10 text-emerald-200" markClass="text-emerald-400" />
    </div>
  );
}

function Block({
  sign,
  text,
  className,
  markClass,
}: {
  sign: string;
  text: string;
  className: string;
  markClass: string;
}) {
  return (
    <div className={className}>
      {text.split('\n').map((line, i) => (
        <div key={i} className="flex">
          <span className={`w-4 shrink-0 select-none px-1 ${markClass}`}>{sign}</span>
          <span className="whitespace-pre-wrap break-all px-1">{line}</span>
        </div>
      ))}
    </div>
  );
}
