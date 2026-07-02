/* global jest, global, describe, beforeEach, afterEach, test, expect */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App.jsx';

jest.mock('./hooks/useSharedState.js', () => ({
  useSharedState: () => ({ state: {}, loading: false, sync: jest.fn() }),
}));

jest.mock('./hooks/useStrategies.js', () => ({
  useStrategies: () => ({ strategies: [], loading: false }),
}));

jest.mock('./hooks/usePairs.js', () => ({
  usePairs: () => ({ availablePairs: [], searchPairs: jest.fn() }),
}));

jest.mock('./hooks/useTheme.js', () => ({
  useTheme: () => {},
}));

jest.mock('./hooks/useAgentUiState.js', () => ({
  useAgentUiState: () => (patch) => fetch('/api/agent/ui-state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }),
}));

jest.mock('./components/ThemeSwitcher.jsx', () => () => <div />);
jest.mock('./components/ErrorBoundary.jsx', () => ({ children }) => <>{children}</>);
jest.mock('./components/Toast.jsx', () => ({
  ToastProvider: ({ children }) => <>{children}</>,
}));

jest.mock('./components/TopNav.jsx', () => ({ onChange }) => (
  <nav>
    <button onClick={() => onChange('backtest')}>Backtest nav</button>
    <button onClick={() => onChange('optimizer')}>Optimizer nav</button>
    <button onClick={() => onChange('auto-quant')}>AutoQuant nav</button>
    <button onClick={() => onChange('strategy-editor')}>Editor nav</button>
  </nav>
));

jest.mock('./components/BacktestForm.jsx', () => () => <div>Backtest mock</div>);
jest.mock('./components/ResultsView.jsx', () => () => <div>Results mock</div>);
jest.mock('./components/BacktestResults.jsx', () => () => <div>Backtest results mock</div>);
jest.mock('./components/SettingsTab.jsx', () => () => <div>Settings mock</div>);
jest.mock('./components/StressTestTab.jsx', () => () => <div>Stress mock</div>);
jest.mock('./components/StrategyEditorTab.jsx', () => ({ onDirtyChange }) => {
  const { useEffect } = jest.requireActual('react');
  useEffect(() => {
    onDirtyChange?.(true);
  }, [onDirtyChange]);
  return <div>Editor mock</div>;
});
jest.mock('./components/PerformanceTab.jsx', () => () => <div>Performance mock</div>);
jest.mock('./components/PairExplorerTab.jsx', () => () => <div>Pair explorer mock</div>);
jest.mock('./components/AssistantTab.jsx', () => () => <div>Assistant tab mock</div>);
jest.mock('./components/AssistantChatPanel.jsx', () => ({ initialContextOverrides, onClose }) => (
  <div>
    <div>Assistant drawer mock</div>
    <pre data-testid="assistant-context">{JSON.stringify(initialContextOverrides)}</pre>
    <button onClick={onClose}>Close assistant</button>
  </div>
));

jest.mock('./components/appShell/AssistantDrawer.jsx', () => ({ context, onClose }) => (
  <div>
    <div>Assistant drawer mock</div>
    <pre data-testid="assistant-context">{JSON.stringify(context)}</pre>
    <button onClick={onClose}>Close assistant</button>
  </div>
));

jest.mock('./components/appShell/TabContentRenderer.jsx', () => ({ activeTab, tabProps }) => {
  const { useEffect } = jest.requireActual('react');

  useEffect(() => {
    if (activeTab === 'optimizer') {
      tabProps.onAgentContextChange?.({
        active_panel: 'live',
        strategy_name: 'OptimizerStrategy',
        optimizer_session_id: 'optimizer-session-1',
        optimizer_trial_number: 7,
        api_session_id: 'api-session-1',
      });
    }
    if (activeTab === 'auto-quant') {
      tabProps.onAgentContextChange?.({
        active_panel: 'stage-2',
        strategy_name: 'AutoQuantStrategy',
        auto_quant_run_id: 'auto-run-1',
      });
    }
    if (activeTab === 'strategy-editor') {
      tabProps.onDirtyChange?.(true);
    }
  }, [activeTab]);

  if (activeTab === 'optimizer') {
    return (
      <div>
        <div>Optimizer mock</div>
        <button onClick={tabProps.onAskAi}>Ask AI</button>
      </div>
    );
  }
  if (activeTab === 'auto-quant') return <div>AutoQuant mock</div>;
  if (activeTab === 'strategy-editor') return <div>Editor mock</div>;
  if (activeTab === 'backtest') return <div>Backtest mock</div>;
  return <div>{activeTab} mock</div>;
});

function agentPosts() {
  return global.fetch.mock.calls
    .filter(([url]) => url === '/api/agent/ui-state')
    .map(([, options]) => JSON.parse(options.body));
}

describe('App agent heartbeat', () => {
  beforeEach(() => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({}),
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('posts active tab and optimizer context to the agent heartbeat', async () => {
    render(<App />);

    await waitFor(() => {
      expect(agentPosts().at(-1).active_tab).toBe('auto-quant');
    });

    fireEvent.click(screen.getByText('Optimizer nav'));
    await waitFor(() => {
      const latest = agentPosts().at(-1);
      expect(latest.active_tab).toBe('optimizer');
      expect(latest.active_panel).toBe('live');
      expect(latest.strategy_name).toBe('OptimizerStrategy');
      expect(latest.optimizer_session_id).toBe('optimizer-session-1');
      expect(latest.optimizer_trial_number).toBe(7);
      expect(latest.api_session_id).toBe('api-session-1');
      expect(latest.auto_quant_run_id).toBeNull();
    });
  });

  test('posts active AutoQuant run context and clears optimizer id', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('AutoQuant nav'));
    await waitFor(() => {
      const latest = agentPosts().at(-1);
      expect(latest.active_tab).toBe('auto-quant');
      expect(latest.active_panel).toBe('stage-2');
      expect(latest.strategy_name).toBe('AutoQuantStrategy');
      expect(latest.auto_quant_run_id).toBe('auto-run-1');
      expect(latest.optimizer_session_id).toBeNull();
      expect(latest.api_session_id).toBeNull();
    });
  });

  test('opens Ask AI drawer with current optimizer context snapshot', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('Optimizer nav'));
    await waitFor(() => {
      expect(agentPosts().at(-1).active_tab).toBe('optimizer');
    });
    fireEvent.click(screen.getByText('Ask AI'));

    const context = JSON.parse(screen.getByTestId('assistant-context').textContent);
    expect(context.active_tab).toBe('optimizer');
    expect(context.active_panel).toBe('live');
    expect(context.strategy_name).toBe('OptimizerStrategy');
    expect(context.optimizer_session_id).toBe('optimizer-session-1');
    expect(context.optimizer_trial_number).toBe(7);
    expect(context.api_session_id).toBe('api-session-1');
  });

  test('blocks leaving the dirty strategy editor until confirmed', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('Editor nav'));
    await screen.findByText('Editor mock');

    fireEvent.click(screen.getByText('Optimizer nav'));
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
    expect(screen.getByText('Editor mock')).toBeInTheDocument();
    expect(screen.queryByText('Optimizer mock')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
    expect(screen.getByText('Editor mock')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Optimizer nav'));
    fireEvent.click(screen.getByText('Leave Anyway'));
    expect(screen.getByText('Optimizer mock')).toBeInTheDocument();
  });
});
