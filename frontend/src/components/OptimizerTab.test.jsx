import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OptimizerTab from './OptimizerTab.jsx';

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="chart">{children}</div>,
  LineChart: ({ children }) => <div>{children}</div>,
  Line: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  ReferenceLine: () => <div />,
}));

class MockEventSource {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
    this.close = jest.fn();
    MockEventSource.instances.push(this);
  }

  emit(data) {
    this.onmessage?.({ data });
  }
}

globalThis.EventSource = MockEventSource;

const strategies = [{ strategy_name: 'DemoStrategy' }];

function completedOptimizerSession() {
  return {
    session_id: 'optimizer-session-1',
    phase: 'completed',
    total_trials: 1,
    completed_trials: 1,
    failed_trials: 0,
    best_trial_number: 1,
    trials: [
      {
        trial_number: 1,
        status: 'completed',
        parameters: { buy_window: 14 },
        started_at: '2024-01-01T00:00:00Z',
        completed_at: '2024-01-01T00:00:05Z',
        metrics: {
          score: 12.5,
          net_profit_pct: 8.2,
          net_profit_abs: 82,
          max_drawdown_pct: -2.1,
          total_trades: 11,
          win_rate_pct: 63.6,
          profit_factor: 1.8,
          sharpe_ratio: 1.2,
        },
      },
    ],
  };
}

function mockFetch({ completed = false, spaces = null, sessionOverride = null } = {}) {
  const searchSpaces = spaces || [
    {
      name: 'buy_window',
      param_type: 'int',
      space: 'buy',
      default: 10,
      enabled: true,
      optimizable: true,
      min_value: 5,
      max_value: 20,
      step: 1,
    },
  ];
  const completedSession = sessionOverride || completedOptimizerSession();
  globalThis.fetch = jest.fn(async url => {
    const text = String(url);
    if (text.includes('/api/optimizer/search-spaces/')) {
      return {
        ok: true,
        json: async () => ({
          search_spaces: [
            ...searchSpaces,
          ],
        }),
      };
    }
    if (text === '/api/optimizer/run') {
      return { ok: true, json: async () => ({ session_id: 'api-session-1' }) };
    }
    if (text.includes('/api/optimizer/sessions?')) {
      return {
        ok: true,
        json: async () => completed ? [
          {
            session_id: 'optimizer-session-1',
            phase: 'completed',
            completed_trials: 1,
            total_trials: 1,
            best_score: 12.5,
          },
        ] : [],
      };
    }
    if (text.includes('/api/session/status/')) {
      return {
        ok: true,
        json: async () => ({
          status: completed ? 'completed' : 'running',
          result: { optimizer_session_id: 'optimizer-session-1' },
        }),
      };
    }
    if (text.includes('/preview-application')) {
      return {
        ok: true,
        json: async () => ({
          modified_json: { buy: { buy_window: 14 } },
        }),
      };
    }
    if (text.includes('/best-trial/params') || text.includes('/trial/1/params')) {
      return {
        ok: true,
        json: async () => ({
          strategy_name: 'DemoStrategy',
          params: { buy: { buy_window: 14 }, sell: {}, roi: {}, trailing: {} },
        }),
      };
    }
    if (text.includes('/promote-candidate')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          strategy_name: 'DemoStrategy',
          candidate_version_id: 'candidate-1',
          trial_number: 1,
          score: 12.5,
          metrics: {},
        }),
      };
    }
    if (text === '/api/optimizer/export-trials') {
      return { ok: true, json: async () => ({ ok: true, count: 1, exported: [] }) };
    }
    if (text.includes('/api/optimizer/cancel/')) {
      return { ok: true, json: async () => ({ ok: true, phase: 'cancelled' }) };
    }
    if (text === '/api/optimizer/apply-trial') {
      return { ok: true, json: async () => ({ ok: true }) };
    }
    if (text.includes('/api/optimizer/session/optimizer-session-1')) {
      return {
        ok: true,
        json: async () => completed ? completedSession : ({
            session_id: 'optimizer-session-1',
            phase: 'running',
            total_trials: 10,
            completed_trials: 0,
            failed_trials: 0,
            trials: [],
          }),
      };
    }
    return { ok: true, json: async () => ({}) };
  });
}

describe('OptimizerTab', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    mockFetch();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders staged optimizer workspace', () => {
    render(<OptimizerTab strategies={strategies} />);

    expect(screen.getByText('Parameter Optimizer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Setup' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Parameters' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Live Results' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trials' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Candidate / Export' })).toBeInTheDocument();
  });

  test('sends optimizer run payload with selected fields and search spaces', async () => {
    render(<OptimizerTab strategies={strategies} />);

    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'DemoStrategy' } });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/optimizer/search-spaces/DemoStrategy'));

    fireEvent.change(screen.getByLabelText('Pairs'), { target: { value: 'BTC/USDT, ETH/USDT' } });
    fireEvent.change(screen.getByLabelText('Score Metric'), { target: { value: 'max_drawdown_pct' } });
    fireEvent.change(screen.getByLabelText('Search Method'), { target: { value: 'grid' } });
    fireEvent.change(screen.getByLabelText('Candidates'), { target: { value: '250' } });
    fireEvent.change(screen.getByLabelText('Keep Ratio'), { target: { value: '0.25' } });
    fireEvent.change(screen.getByLabelText('Timeout Seconds'), { target: { value: '45' } });

    const runButtons = screen.getAllByRole('button', { name: /Run Optimizer/i });
    fireEvent.click(runButtons[runButtons.length - 1]);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/optimizer/run', expect.any(Object)));
    const [, options] = fetch.mock.calls.find(([url]) => url === '/api/optimizer/run');
    const body = JSON.parse(options.body);

    expect(body.strategy_name).toBe('DemoStrategy');
    expect(body.pairs).toEqual(['BTC/USDT', 'ETH/USDT']);
    expect(body.search_strategy).toBe('grid');
    expect(body.parameter_mode).toBe('auto_safe');
    expect(body.score_metric).toBe('max_drawdown_pct');
    expect(body.timeframe).toBe('1h');
    expect(body.enable_vectorbt_screening).toBe(true);
    expect(body.vectorbt_candidate_count).toBe(250);
    expect(body.vectorbt_keep_ratio).toBe(0.25);
    expect(body.vectorbt_timeout_seconds).toBe(45);
    expect(body.search_spaces).toHaveLength(1);
    expect(body.search_spaces[0].name).toBe('buy_window');
  });

  test('auto safe locks advanced and optimize false spaces before run', async () => {
    mockFetch({
      spaces: [
        {
          name: 'buy_window',
          param_type: 'int',
          space: 'buy',
          default: 10,
          enabled: true,
          optimizable: true,
          min_value: 5,
          max_value: 20,
          step: 1,
        },
        {
          name: 'sell_window',
          param_type: 'int',
          space: 'sell',
          default: 10,
          enabled: true,
          optimizable: true,
          min_value: 5,
          max_value: 20,
          step: 1,
        },
        {
          name: 'fixed_window',
          param_type: 'int',
          space: 'buy',
          default: 10,
          enabled: true,
          optimizable: false,
          min_value: 5,
          max_value: 20,
          step: 1,
        },
        {
          name: 'roi__0',
          param_type: 'decimal',
          space: 'roi',
          default: 0.1,
          enabled: true,
          optimizable: true,
          min_value: 0.01,
          max_value: 0.3,
          step: 0.01,
        },
      ],
    });
    render(<OptimizerTab strategies={strategies} />);

    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'DemoStrategy' } });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/optimizer/search-spaces/DemoStrategy'));
    fireEvent.change(screen.getByLabelText('Pairs'), { target: { value: 'BTC/USDT' } });

    const runButtons = screen.getAllByRole('button', { name: /Run Optimizer/i });
    fireEvent.click(runButtons[runButtons.length - 1]);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/optimizer/run', expect.any(Object)));
    const [, options] = fetch.mock.calls.find(([url]) => url === '/api/optimizer/run');
    const byName = Object.fromEntries(JSON.parse(options.body).search_spaces.map(sp => [sp.name, sp]));

    expect(byName.buy_window.enabled).toBe(true);
    expect(byName.sell_window.enabled).toBe(true);
    expect(byName.fixed_window.enabled).toBe(false);
    expect(byName.roi__0.enabled).toBe(false);
  });

  test('manual parameter edits switch run payload to manual mode', async () => {
    render(<OptimizerTab strategies={strategies} />);

    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'DemoStrategy' } });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/optimizer/search-spaces/DemoStrategy'));
    fireEvent.change(screen.getByLabelText('Pairs'), { target: { value: 'BTC/USDT' } });

    fireEvent.click(screen.getByRole('button', { name: 'Parameters' }));
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getAllByRole('checkbox')[0]);

    const runButtons = screen.getAllByRole('button', { name: /Run Optimizer/i });
    fireEvent.click(runButtons[runButtons.length - 1]);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/optimizer/run', expect.any(Object)));
    const [, options] = fetch.mock.calls.find(([url]) => url === '/api/optimizer/run');
    expect(JSON.parse(options.body).parameter_mode).toBe('manual');
  });

  test('renders persisted auto safe lock events from optimizer sessions', async () => {
    mockFetch({
      completed: true,
      sessionOverride: {
        ...completedOptimizerSession(),
        auto_lock_events: [
          {
            trial_number: 4,
            reason: 'zero_trade_trials',
            locked_params: ['sell_b', 'sell_c'],
            before_enabled_count: 6,
            after_enabled_count: 4,
            grid_epoch_before: 1,
            grid_epoch_after: 2,
            grid_epoch_start_trial: 4,
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      },
    });
    render(<OptimizerTab strategies={strategies} />);

    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'DemoStrategy' } });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/optimizer/search-spaces/DemoStrategy'));

    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    fireEvent.click((await screen.findByText('optimize')).closest('button'));
    fireEvent.click(screen.getByRole('button', { name: 'Trials' }));

    expect(await screen.findByText('Before trial #4')).toBeInTheDocument();
    expect(screen.getByText('zero trade trials - Grid epoch 1->2')).toBeInTheDocument();
    expect(screen.getByText('sell_b')).toBeInTheDocument();
  });

  test('renders VectorBT screening summary and top candidates from completed session', async () => {
    mockFetch({
      completed: true,
      sessionOverride: {
        ...completedOptimizerSession(),
        vectorbt_screening: {
          status: 'completed',
          started_at: '2024-01-01T00:00:00Z',
          completed_at: '2024-01-01T00:00:01Z',
          evaluated_count: 4,
          selected_count: 2,
          reduction_pct: 50,
          duration_seconds: 1.2,
          top_candidates: [
            {
              rank: 1,
              parameters: { buy_window: 14 },
              metrics: {
                score: 9.5,
                net_profit_pct: 5.2,
                max_drawdown_pct: -1.4,
                total_trades: 12,
              },
            },
          ],
        },
      },
    });
    render(<OptimizerTab strategies={strategies} />);

    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'DemoStrategy' } });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/optimizer/search-spaces/DemoStrategy'));

    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    fireEvent.click((await screen.findByText(/1 \/ 1 trials/)).closest('button'));

    expect(await screen.findByText('Pre-screening only chooses candidate order; Freqtrade backtests remain the saved optimizer results.')).toBeInTheDocument();
    expect(await screen.findByText('50.0%')).toBeInTheDocument();
    expect(screen.getByText('buy_window=14')).toBeInTheDocument();
  });

  test('parses SSE log JSON payloads into readable log lines', async () => {
    render(<OptimizerTab strategies={strategies} />);

    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'DemoStrategy' } });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/optimizer/search-spaces/DemoStrategy'));
    fireEvent.change(screen.getByLabelText('Pairs'), { target: { value: 'BTC/USDT' } });

    const runButtons = screen.getAllByRole('button', { name: /Run Optimizer/i });
    fireEvent.click(runButtons[runButtons.length - 1]);

    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    act(() => {
      MockEventSource.instances[0].emit(JSON.stringify({ message: '[Trial #1] Completed', ts: 'now' }));
    });

    fireEvent.click(screen.getByRole('button', { name: /Logs/i }));

    expect(await screen.findByText('[Trial #1] Completed')).toBeInTheDocument();
  });

  test('blocks run until at least one pair is present', async () => {
    render(<OptimizerTab strategies={strategies} />);

    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'DemoStrategy' } });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/optimizer/search-spaces/DemoStrategy'));

    expect(screen.getByText('Add at least one trading pair.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Run Optimizer/i }).at(-1)).toBeDisabled();
    expect(fetch).not.toHaveBeenCalledWith('/api/optimizer/run', expect.any(Object));
  });

  test('views best params, promotes best, and exports best through optimizer APIs', async () => {
    mockFetch({ completed: true });
    render(<OptimizerTab strategies={strategies} />);

    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'DemoStrategy' } });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/optimizer/search-spaces/DemoStrategy'));

    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    fireEvent.click((await screen.findByText('optimize')).closest('button'));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Promote Best to Candidate' })).toBeInTheDocument());

    const viewParamsButton = screen.getByRole('button', { name: 'View Best Params' });
    await waitFor(() => expect(viewParamsButton).not.toBeDisabled());
    fireEvent.click(viewParamsButton);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/optimizer/session/optimizer-session-1/best-trial/params',
      expect.any(Object),
    ));
    const closeButtons = screen.queryAllByRole('button', { name: 'Close' });
    if (closeButtons.length) fireEvent.click(closeButtons[closeButtons.length - 1]);

    fireEvent.click(screen.getByRole('button', { name: 'Promote Best to Candidate' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/optimizer/session/optimizer-session-1/best-trial/promote-candidate',
      expect.objectContaining({ method: 'POST' }),
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Export Best to Stress Lab' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/optimizer/export-trials', expect.any(Object)));
  });

  test('closes live log stream on unmount', async () => {
    const { unmount } = render(<OptimizerTab strategies={strategies} />);

    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'DemoStrategy' } });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/optimizer/search-spaces/DemoStrategy'));
    fireEvent.change(screen.getByLabelText('Pairs'), { target: { value: 'BTC/USDT' } });

    const runButtons = screen.getAllByRole('button', { name: /Run Optimizer/i });
    fireEvent.click(runButtons[runButtons.length - 1]);

    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    unmount();

    expect(MockEventSource.instances[0].close).toHaveBeenCalled();
  });

  test('requires exact overwrite confirmation before applying accepted params', async () => {
    mockFetch({ completed: true });
    render(<OptimizerTab strategies={strategies} />);

    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'DemoStrategy' } });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/optimizer/search-spaces/DemoStrategy'));

    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    fireEvent.click((await screen.findByText('optimize')).closest('button'));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Promote Best to Candidate' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Show overwrite actions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Overwrite Accepted with Best Trial' }));

    const confirmButton = await screen.findByRole('button', { name: 'Yes, Overwrite Accepted Params' });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Type OVERWRITE 1 to confirm'), { target: { value: 'OVERWRITE' } });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Type OVERWRITE 1 to confirm'), { target: { value: 'OVERWRITE 1' } });
    expect(confirmButton).not.toBeDisabled();

    fireEvent.click(confirmButton);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/optimizer/apply-trial', expect.any(Object)));
  });
});
