/* global describe, beforeEach, jest, afterEach, test, expect */
import { render, screen } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

describe('ErrorBoundary', () => {
  const ThrowError = () => {
    throw new Error('Test error');
  };

  const ChildComponent = () => <div>Child Component</div>;

  beforeEach(() => {
    // Suppress console.error for these tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <ChildComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Child Component')).toBeInTheDocument();
  });

  test('catches errors and displays error UI', () => {
    render(
      <ErrorBoundary tabName="TestTab">
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('TestTab encountered an unexpected error')).toBeInTheDocument();
    expect(screen.getByText('Test error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  test('resets state when retry button is clicked', () => {
    const { rerender } = render(
      <ErrorBoundary tabName="TestTab">
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('TestTab encountered an unexpected error')).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: 'Retry' });
    retryButton.click();

    rerender(
      <ErrorBoundary tabName="TestTab">
        <ChildComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Child Component')).toBeInTheDocument();
  });

  test('logs error to console', () => {
    render(
      <ErrorBoundary tabName="TestTab">
        <ThrowError />
      </ErrorBoundary>
    );

    expect(console.error).toHaveBeenCalledWith(
      '[ErrorBoundary] Caught error in tab:',
      'TestTab',
      expect.any(Error),
      expect.any(Object)
    );
  });
});
