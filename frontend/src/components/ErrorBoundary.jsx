/* global process */
import { Component } from "react";
import logger from "../utils/logger";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    logger.error(`ErrorBoundary caught an error in ${this.props.tabName || 'component'}:`, error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const tabName = this.props.tabName || "component";
      const isOptimizer = tabName === "Optimizer";
      
      return (
        <div className="alert alert-error shadow-lg max-w-4xl mx-auto mt-8">
          <div>
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="font-bold">Something went wrong in {tabName}!</h3>
              <div className="text-xs">
                {this.props.fallbackMessage || "An unexpected error occurred. Please refresh the page."}
              </div>
              {isOptimizer && (
                <div className="text-xs mt-2">
                  <strong>Optimizer-specific recovery:</strong> Check the optimizer session logs, ensure no other optimizer sessions are running, and try starting a new session.
                </div>
              )}
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer font-semibold">Error details</summary>
                  <pre className="mt-2 p-2 bg-base-200 rounded overflow-auto max-h-48">
                    {this.state.error.toString()}
                    {this.state.errorInfo && this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
              <button 
                className="btn btn-sm btn-error mt-3"
                onClick={this.handleReset}
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;