import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw, ShieldQuestion } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * When this value changes the boundary clears its error state. The shell passes
   * the active section, so navigating away from a broken screen recovers it.
   */
  resetKey?: string;
  /** Optional escape hatch back to a known-good screen. */
  onGoToDashboard?: () => void;
}

interface ErrorBoundaryState {
  /** The caught error, or null while everything renders. */
  failed: boolean;
}

/**
 * Catches unexpected rendering errors so a single broken screen can never leave
 * the window blank.
 *
 * The technical error is logged for developers only; the user sees a readable
 * message and two recovery actions. Nothing is deleted: the imported workbook,
 * the filters and the source spreadsheet are untouched.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Developer detail only: never rendered into the interface.
    console.error('[ui] the interface failed to render', error, info.componentStack);
  }

  override componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  private readonly retry = (): void => {
    this.setState({ failed: false });
  };

  override render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children;
    }

    return (
      <ErrorState
        icon={ShieldQuestion}
        title="Something went wrong"
        message="The application encountered an unexpected error. Your imported records were not changed — try again, or switch to another screen."
        action={
          <>
            <Button icon={RotateCcw} onClick={this.retry}>
              Try Again
            </Button>
            {this.props.onGoToDashboard && (
              <Button variant="ghost" onClick={this.props.onGoToDashboard}>
                Go to Dashboard
              </Button>
            )}
          </>
        }
      />
    );
  }
}
