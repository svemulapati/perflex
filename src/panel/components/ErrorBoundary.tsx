import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  label?: string;
}
interface State {
  error: Error | null;
}

/** Keeps a crashing view from taking down the whole panel. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[Perflex] view "${this.props.label ?? 'unknown'}" crashed`, error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-3 rounded border border-severity-critical/40 bg-severity-critical/10 p-3 text-xs text-rose-200">
          <div className="font-semibold">This view hit an error.</div>
          <div className="mt-1 font-mono text-[10px] opacity-80">{this.state.error.message}</div>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-2 rounded bg-zinc-800 px-2 py-0.5 text-zinc-200 hover:bg-zinc-700"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
