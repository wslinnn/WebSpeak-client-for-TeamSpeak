import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// 全局兜底：渲染期异常不白屏（Phase 4 各页可再套更细粒度的边界）。
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled render error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-base" data-ws-part="error-boundary">
        <div className="flex max-w-md flex-col gap-3">
          <p className="text-lg font-medium">页面出错了 / Something went wrong</p>
          <p className="text-muted-foreground">{this.state.error.message}</p>
          <button
            type="button"
            className="bg-primary text-primary-foreground ring-1 ring-foreground/10 rounded-lg px-3 py-2"
            onClick={() => window.location.reload()}
          >
            重新加载 / Reload
          </button>
        </div>
      </div>
    );
  }
}
