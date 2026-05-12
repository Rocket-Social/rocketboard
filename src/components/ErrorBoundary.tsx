import {Component, type ErrorInfo, type ReactNode} from 'react'

import {captureException} from '../platform/monitoring'
import {Button} from './ui/button'

type ErrorBoundaryFallbackRenderProps = {
  error: Error
  label?: string
  reset: () => void
}

type ErrorBoundaryProps = {
  children: ReactNode
  fallback?: ReactNode | ((props: ErrorBoundaryFallbackRenderProps) => ReactNode)
  /** Context label shown in the error UI (e.g. "Table View", "Card Sheet") */
  label?: string
}

type ErrorBoundaryState = {
  error: Error | null
}

/**
 * Catches render-time errors in a subtree and displays a recovery UI
 * instead of white-screening the entire app.
 *
 * Usage:
 *   <ErrorBoundary label="Table View">
 *     <TableViewRoute />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {error: null}
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {error}
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ''}]`, error, info.componentStack)
    captureException(error, {
      boundary: this.props.label ?? 'unlabeled',
      componentStack: info.componentStack,
    })
  }

  private reset = () => {
    this.setState({error: null})
  }

  render() {
    if (this.state.error) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback({
          error: this.state.error,
          label: this.props.label,
          reset: this.reset,
        })
      }

      if (this.props.fallback) return this.props.fallback

      return (
        <div className='flex flex-col items-center justify-center p-8 text-center'>
          <div className='max-w-sm rounded-xl border border-border-subtle bg-surface-base p-6'>
            <p className='font-mono text-xs font-medium uppercase tracking-wider text-error'>
              {this.props.label ? `${this.props.label} Error` : 'Something went wrong'}
            </p>
            <p className='mt-3 text-sm text-text-muted'>
              This section hit an unexpected error. Your data is safe.
            </p>
            <Button
              className='mt-4'
              onClick={this.reset}
              variant='secondary'
            >
              Try again
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
