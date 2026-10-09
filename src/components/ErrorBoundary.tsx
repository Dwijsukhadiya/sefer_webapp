"use client";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  section: string; // shown in the fallback, e.g. "Entry lines"
  resetKey?: unknown; // when this changes (e.g. a rebuilt entry), try rendering again
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * One odd document must not blank the whole screen. A section that throws while rendering
 * is replaced by a small notice; every other section keeps working.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.section}] render failed`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
        <p className="font-semibold text-amber-900">Unable to render the {this.props.section} section</p>
        <p className="mt-1 text-xs text-amber-800">
          The rest of the entry is unaffected. Check the extracted documents for an unusual value, then try again.
        </p>
        <p className="mt-1 font-mono text-[11px] text-amber-700">{this.state.error.message}</p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-2 rounded-md bg-white px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100"
        >
          Try again
        </button>
      </section>
    );
  }
}
