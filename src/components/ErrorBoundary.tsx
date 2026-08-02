import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearAutosave } from '../game/storage';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors so a bad save or an unexpected state can never leave
 * the player staring at a blank page. Offers a route back that discards the
 * autosave, which is the usual cause of an unrecoverable render.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[sovereign] Unhandled render error', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
    window.location.href = '/';
  };

  private hardReset = (): void => {
    clearAutosave();
    this.setState({ error: null });
    window.location.href = '/';
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="glass-strong w-full max-w-lg p-8 text-center">
          <span className="text-4xl">🏛️</span>
          <h1 className="mt-4 font-display text-xl font-bold text-white">Something went wrong</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            The interface hit an error it could not recover from. Your saved campaigns are still on disk.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-ink-900/80 p-3 text-left text-[11px] text-aurora-red">
            {error.message}
          </pre>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              onClick={this.reset}
              className="focus-ring rounded-xl bg-gradient-to-b from-gold-400 to-gold-600 px-5 py-2.5 text-sm font-semibold text-ink-950"
            >
              Back to the menu
            </button>
            <button
              onClick={this.hardReset}
              className="focus-ring rounded-xl border border-white/10 bg-white/[0.07] px-5 py-2.5 text-sm text-white"
            >
              Discard autosave and restart
            </button>
          </div>
        </div>
      </div>
    );
  }
}
