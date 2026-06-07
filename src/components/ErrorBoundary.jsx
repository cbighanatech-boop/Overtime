import React from 'react'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center p-12 text-gray-400">
          <p className="text-sm font-semibold text-red-500">Something went wrong on this page.</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 px-4 py-2 bg-[#006939] text-white text-xs font-bold rounded-lg"
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
