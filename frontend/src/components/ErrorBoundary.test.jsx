import { fireEvent, render, screen } from '@testing-library/react';
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

    expect(screen.getByText('Something went wrong in TestTab!')).toBeInTheDocument();
    expect(screen.getByText('An unexpected error occurred. Please refresh the page.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
  });

  test('resets state when retry button is clicked', () => {
    const { rerender } = render(
      <ErrorBoundary tabName="TestTab">
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong in TestTab!')).toBeInTheDocument();

    rerender(
      <ErrorBoundary tabName="TestTab">
        <ChildComponent />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    expect(screen.getByText('Child Component')).toBeInTheDocument();
  });

  test('logs error to console', () => {
    render(
      <ErrorBoundary tabName="TestTab">
        <ThrowError />
      </ErrorBoundary>
    );

    expect(console.error).toHaveBeenCalledWith(
      expect.stringMatching(/^\[.*\] \[ERROR\]$/),
      'ErrorBoundary caught an error in TestTab:',
      expect.any(Error),
      expect.any(Object)
    );
  });
});
