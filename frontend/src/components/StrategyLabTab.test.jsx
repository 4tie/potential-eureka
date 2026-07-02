/* global jest, describe, beforeEach, afterEach, test, expect */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StrategyLabTab from './StrategyLabTab.jsx';

const runId = "test-run-123";
const candidateRunsUrl = "/api/candidate/runs";

const mockVerdict = {
  passed: true,
  gate_results: [
    {
      gate_name: "backtest_gate",
      passed: true,
      metrics: {
        total_trades: 50,
        win_rate_pct: 60,
        profit_factor: 2.5,
        max_drawdown_pct: 5,
        expectancy: 1.2,
        sharpe_ratio: 1.1,
      },
      details: { failures: [] },
    },
    {
      gate_name: "individual_pair_sweep",
      passed: true,
      details: {
        results: [
          { pair: "BTC/USDT", status: "passed", profit_factor: 2.5, max_drawdown: 5, total_trades: 30 },
          { pair: "ETH/USDT", status: "passed", profit_factor: 2.0, max_drawdown: 8, total_trades: 20 },
        ],
      },
    },
  ],
  repair_attempts: [],
  final_pair_set: ["BTC/USDT", "ETH/USDT"],
  portfolio_metrics: { profit_total_abs: 100, max_drawdown_pct: 5 },
  failure_reason: null
};

const mockDataQualityVerdict = {
  passed: false,
  gate_results: [
    {
      gate_name: "data_quality",
      passed: false,
      details: {
        errors: ["MISSING_DATA_FILE: SOL/USDT - file does not exist"],
        pair_details: {
          "SOL/USDT": {
            exists: false,
            data_file: "user_data/data/binance/SOL_USDT-5m.feather",
          },
        },
        missing_pairs: ["SOL/USDT"],
        timeframe: "5m",
        timerange: "20240101-20240401",
        config_file: "config.json",
        user_data_dir: "user_data",
        exchange: "binance",
        download_command_hint: (
          "freqtrade download-data -c config.json --timeframes 5m "
          + "--timerange 20240101-20240401 --pairs SOL/USDT"
        ),
      },
    },
  ],
  repair_attempts: [],
  final_pair_set: [],
  portfolio_metrics: {},
  failure_reason: "data_quality",
};

function mockFetch({ startSuccess = true, runState = null } = {}) {
  globalThis.fetch = jest.fn(async (url, options = {}) => {
    const text = String(url);

    if (text === candidateRunsUrl && options.method === 'POST') {
      if (!startSuccess) {
        return {
          ok: false,
          text: async () => "Failed to start run"
        };
      }
      return {
        ok: true,
        json: async () => ({ run_id: runId, status: "running", message: "started" })
      };
    }

    if (text === `${candidateRunsUrl}/${runId}`) {
      return {
        ok: true,
        json: async () => runState || {
          run_id: runId,
          status: "completed",
          verdict: mockVerdict,
          gates: []
        }
      };
    }

    return { ok: true, json: async () => ({}) };
  });
}

let sockets;

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    this.readyState = 0;
    sockets.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }

  send() {}

  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  }

  emit(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

function previewSpec() {
  // The new StrategySpecPreview component shows the visual preview by default
  // We need to click "Show JSON" to see the raw JSON
  const showJsonButton = screen.queryByRole('button', { name: 'Show JSON' });
  if (showJsonButton) {
    fireEvent.click(showJsonButton);
  }
  // Find the JSON content in the enhanced preview - look for the specific container
  const jsonContainer = document.querySelector('.overflow-auto.max-h-96');
  if (!jsonContainer) {
    throw new Error('Could not find JSON preview container');
  }
  // Get all text content and parse it
  const textContent = jsonContainer.textContent;
  return JSON.parse(textContent);
}

function startRunCallBody() {
  const call = globalThis.fetch.mock.calls.find(([url]) => (
    String(url) === candidateRunsUrl
  ));
  return JSON.parse(call[1].body);
}

async function startRunAndGetSocket() {
  fireEvent.click(screen.getByRole('button', { name: 'Start Evaluation' }));

  await waitFor(() => {
    expect(globalThis.fetch).toHaveBeenCalledWith(
      candidateRunsUrl,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  await waitFor(() => {
    expect(sockets).toHaveLength(1);
  });

  return sockets[0];
}

describe('StrategyLabTab', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    sockets = [];
    globalThis.WebSocket = jest.fn(function WebSocketMock(url) {
      return new MockWebSocket(url);
    });
    mockFetch();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete globalThis.fetch;
    delete globalThis.WebSocket;
  });

  test('Simple Mode renders fields and preview JSON', () => {
    render(<StrategyLabTab />);

    expect(screen.getByRole('button', { name: 'Simple Mode' })).toBeInTheDocument();
    expect(screen.getByLabelText('Strategy name')).toBeInTheDocument();
    expect(screen.getByLabelText('Trading style')).toBeInTheDocument();
    expect(screen.getByLabelText('Trading horizon')).toBeInTheDocument();
    expect(screen.getByLabelText('Direction')).toBeInTheDocument();
    expect(screen.getByLabelText('Risk profile')).toBeInTheDocument();
    expect(screen.getByLabelText('Timeframe')).toBeInTheDocument();
    expect(screen.getByLabelText('Max Repair Attempts')).toBeInTheDocument();
    expect(screen.getByLabelText('Pair universe mode')).toBeInTheDocument();
    expect(screen.getByLabelText('Pairs / pair universe')).toBeInTheDocument();

    const spec = previewSpec();
    expect(spec.trading_style).toBe('trend_following');
    // direction is now part of the spec (MVP requires it)
    expect(spec).toHaveProperty('direction');
    expect(spec.description).toContain('scalping horizon');
  });

  test('auto scalping pair universe has more than two liquid major pairs', () => {
    render(<StrategyLabTab />);

    const pairs = screen.getByLabelText('Pairs / pair universe').value
      .split(',')
      .map((pair) => pair.trim());

    expect(screen.getByLabelText('Pair universe mode')).toHaveValue('auto');
    expect(screen.getByLabelText('Trading horizon')).toHaveValue('scalping');
    expect(pairs.length).toBeGreaterThan(2);
    expect(pairs).toEqual(expect.arrayContaining(['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT']));
  });

  test('each preset generates JSON without unsupported ema aliases', () => {
    render(<StrategyLabTab />);

    const styles = ['trend_following', 'mean_reversion', 'momentum', 'breakout'];
    const styleSelect = screen.getByLabelText('Trading style');

    styles.forEach((style) => {
      fireEvent.change(styleSelect, { target: { value: style } });
      const spec = previewSpec();
      const json = JSON.stringify(spec);

      expect(spec.trading_style).toBe(style);
      expect(json).not.toContain('ema_fast');
      expect(json).not.toContain('ema_slow');
      expect(spec.indicators.length).toBeGreaterThan(0);
      expect(spec.entry_conditions.length).toBeGreaterThan(0);
      expect(spec.exit_conditions.length).toBeGreaterThan(0);
    });
  });

  test('risk profile changes stoploss, max_open_trades, and max_iterations', () => {
    render(<StrategyLabTab />);

    const riskSelect = screen.getByLabelText('Risk profile');

    fireEvent.change(riskSelect, { target: { value: 'low' } });
    expect(previewSpec()).toMatchObject({
      stoploss: -0.05,
      max_open_trades: 2,
      max_iterations: 2,
    });

    fireEvent.change(riskSelect, { target: { value: 'balanced' } });
    expect(previewSpec()).toMatchObject({
      stoploss: -0.10,
      max_open_trades: 3,
      max_iterations: 3,
    });

    fireEvent.change(riskSelect, { target: { value: 'aggressive' } });
    expect(previewSpec()).toMatchObject({
      stoploss: -0.15,
      max_open_trades: 5,
      max_iterations: 5,
    });
  });

  test('UI label shows "Max Repair Attempts"', () => {
    render(<StrategyLabTab />);
    expect(screen.getByLabelText('Max Repair Attempts')).toBeInTheDocument();
  });

  test('direction is included in StrategySpec payload', () => {
    render(<StrategyLabTab />);
    const spec = previewSpec();
    // direction is now part of the spec (MVP requires it)
    expect(spec).toHaveProperty('direction');
  });

  test('Reset to preset restores preset defaults', () => {
    render(<StrategyLabTab />);

    fireEvent.change(screen.getByLabelText('Trading style'), { target: { value: 'breakout' } });
    fireEvent.change(screen.getByLabelText('Strategy name'), { target: { value: 'CustomStrategy' } });
    fireEvent.change(screen.getByLabelText('Risk profile'), { target: { value: 'aggressive' } });
    fireEvent.change(screen.getByLabelText('Max Repair Attempts'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Pair universe mode'), { target: { value: 'manual' } });
    fireEvent.change(screen.getByLabelText('Pairs / pair universe'), { target: { value: 'SOL/USDT' } });

    fireEvent.click(screen.getByRole('button', { name: 'Reset to preset' }));

    expect(screen.getByLabelText('Strategy name')).toHaveValue('BreakoutStrategy');
    expect(screen.getByLabelText('Risk profile')).toHaveValue('balanced');
    expect(screen.getByLabelText('Max Repair Attempts')).toHaveValue(3);
    expect(screen.getByLabelText('Pair universe mode')).toHaveValue('auto');
    expect(screen.getByLabelText('Pairs / pair universe').value).toContain('SOL/USDT');
    expect(previewSpec().trading_style).toBe('breakout');
  });

  test('Advanced JSON mode still works', async () => {
    render(<StrategyLabTab />);
    const advancedSpec = previewSpec();

    fireEvent.click(screen.getByRole('button', { name: 'Advanced JSON' }));

    expect(screen.getByText('StrategySpec (JSON)')).toBeInTheDocument();
    expect(screen.getByText('CandidateConfig (JSON)')).toBeInTheDocument();

    const textareas = screen.getAllByRole('textbox');
    advancedSpec.name = "AdvancedStrategy";
    const advancedConfig = {
      timerange: "20240101-20240401",
      timeframe: "5m",
      pairs: ["SOL/USDT"],
      user_data_dir: "user_data",
      config_file: "config.json",
      exchange: "binance",
      max_repair_iterations: 3,
    };

    fireEvent.change(textareas[0], { target: { value: JSON.stringify(advancedSpec, null, 2) } });
    fireEvent.change(textareas[1], { target: { value: JSON.stringify(advancedConfig, null, 2) } });

    await startRunAndGetSocket();

    const body = startRunCallBody();
    expect(body.spec.name).toBe('AdvancedStrategy');
    expect(body.config.pairs).toEqual(['SOL/USDT']);
  });

  test('invalid name blocks submit', async () => {
    render(<StrategyLabTab />);

    fireEvent.change(screen.getByLabelText('Strategy name'), { target: { value: '1BadName' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start Evaluation' }));

    expect(await screen.findByText(/Strategy name must start/i)).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('empty pairs blocks submit', async () => {
    render(<StrategyLabTab />);

    fireEvent.change(screen.getByLabelText('Pair universe mode'), { target: { value: 'manual' } });
    fireEvent.change(screen.getByLabelText('Pairs / pair universe'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start Evaluation' }));

    expect(await screen.findByText(/At least one pair is required/i)).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('direction control only exposes supported long direction', () => {
    render(<StrategyLabTab />);

    const directionSelect = screen.getByLabelText('Direction');
    expect(directionSelect).toHaveValue('long');
    expect(
      Array.from(directionSelect.options).map((option) => option.value)
    ).toEqual(['long']);
  });

  test('incompatible horizon and timeframe blocks submit', async () => {
    render(<StrategyLabTab />);

    fireEvent.change(screen.getByLabelText('Trading horizon'), { target: { value: 'scalping' } });
    fireEvent.change(screen.getByLabelText('Timeframe'), { target: { value: '1h' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start Evaluation' }));

    expect((await screen.findAllByText(/scalping supports 1m, 5m, 15m/i)).length).toBeGreaterThan(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('manual pair mode still works and submits typed pairs', async () => {
    render(<StrategyLabTab />);

    fireEvent.change(screen.getByLabelText('Strategy name'), { target: { value: 'SimpleGeneratedStrategy' } });
    fireEvent.change(screen.getByLabelText('Trading style'), { target: { value: 'momentum' } });
    fireEvent.change(screen.getByLabelText('Pair universe mode'), { target: { value: 'manual' } });
    fireEvent.change(screen.getByLabelText('Pairs / pair universe'), {
      target: { value: 'SOL/USDT\nADA/USDT' },
    });

    await startRunAndGetSocket();

    const body = startRunCallBody();
    expect(body.spec.name).toBe('SimpleGeneratedStrategy');
    expect(body.spec.trading_style).toBe('momentum');
    // direction is now part of the spec (MVP requires it)
    expect(body.spec.direction).toBe('long');
    expect(JSON.stringify(body.spec)).not.toContain('ema_fast');
    expect(JSON.stringify(body.spec)).not.toContain('ema_slow');
    expect(body.config.pairs).toEqual(['SOL/USDT', 'ADA/USDT']);
    expect(body.config.risk_profile).toBe('balanced');
  });

  test('auto mode Start Evaluation submits generated scalping universe', async () => {
    render(<StrategyLabTab />);

    await startRunAndGetSocket();

    const body = startRunCallBody();
    expect(body.spec).not.toHaveProperty('trading_horizon');
    expect(body.spec.description).toContain('scalping horizon');
    expect(body.config.pairs.length).toBeGreaterThan(2);
    expect(body.config.pairs).toEqual(expect.arrayContaining(['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT']));
    expect(body.config.auto_download_data).toBe(true);
    expect(body.config.max_data_download_attempts).toBe(1);
  });

  test('workflow timeline includes Data Download gate', async () => {
    render(<StrategyLabTab />);

    await startRunAndGetSocket();

    expect(screen.getByText('Data Download')).toBeInTheDocument();
  });

  test('WebSocket snapshot populates timeline', async () => {
    render(<StrategyLabTab />);
    const socket = await startRunAndGetSocket();

    act(() => {
      socket.emit({
        type: 'snapshot',
        run_id: runId,
        data: {
          run_id: runId,
          status: 'running',
          current_gate: 'render_strategy',
          gates: [
            { gate_name: 'strategy_spec', status: 'passed', duration_s: 0.5 },
            { gate_name: 'render_strategy', status: 'running', message: 'Rendering strategy...' }
          ]
        }
      });
    });

    expect(screen.getByText('Strategy Spec')).toBeInTheDocument();
    expect(screen.getByText('Rendering strategy...')).toBeInTheDocument();
  });

  test('gate_update updates one gate status', async () => {
    render(<StrategyLabTab />);
    const socket = await startRunAndGetSocket();

    act(() => {
      socket.emit({
        type: 'gate_update',
        run_id: runId,
        data: {
          gate_name: 'backtest_gate',
          status: 'passed',
          duration_s: 5.2,
          message: 'Backtest completed successfully'
        }
      });
    });

    expect(screen.getByText('Backtest Gate')).toBeInTheDocument();
    expect(screen.getByText('Backtest completed successfully')).toBeInTheDocument();
  });

  test('final event renders verdict and stops running', async () => {
    render(<StrategyLabTab />);
    const socket = await startRunAndGetSocket();

    act(() => {
      socket.emit({
        type: 'final',
        run_id: runId,
        data: {
          run_id: runId,
          status: 'completed',
          verdict: mockVerdict,
          gates: [],
        }
      });
    });

    expect(screen.getByText('Final Verdict')).toBeInTheDocument();
    expect(screen.getByText('PASSED')).toBeInTheDocument();
    expect(screen.getByText('Backtest Metrics')).toBeInTheDocument();
    expect(screen.getByText('Pair Sweep Results')).toBeInTheDocument();
    expect(screen.queryByText('Running...')).not.toBeInTheDocument();
  });

  test('WS error shows error panel', async () => {
    render(<StrategyLabTab />);
    const socket = await startRunAndGetSocket();

    act(() => {
      socket.emit({
        type: 'error',
        run_id: runId,
        error: 'Backend processing error'
      });
    });

    expect(screen.getByText(/Backend processing error/)).toBeInTheDocument();
  });

  test('data_quality failure renders missing-data message and command hint', async () => {
    render(<StrategyLabTab />);
    const socket = await startRunAndGetSocket();

    act(() => {
      socket.emit({
        type: 'final',
        run_id: runId,
        data: {
          run_id: runId,
          status: 'completed',
          verdict: mockDataQualityVerdict,
          gates: [
            {
              gate_name: 'data_quality',
              status: 'failed',
              errors: ['MISSING_DATA_FILE: SOL/USDT - file does not exist'],
              details: mockDataQualityVerdict.gate_results[0].details,
            },
          ],
        }
      });
    });

    expect(screen.getByText(/Market data is missing or insufficient/i)).toBeInTheDocument();
    expect(screen.getByText(/Missing pairs:/i)).toBeInTheDocument();
    expect(screen.getAllByText(/SOL\/USDT/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/freqtrade download-data -c config\.json/i)).toBeInTheDocument();
  });

  test('polling fallback calls getRun when socket closes before final', async () => {
    render(<StrategyLabTab />);
    const socket = await startRunAndGetSocket();

    await act(async () => {
      socket.close();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(globalThis.fetch.mock.calls.some(([url]) => (
        String(url) === `${candidateRunsUrl}/${runId}`
      ))).toBe(true);
    });
  });

  test('invalid JSON shows parse error in Advanced mode', async () => {
    render(<StrategyLabTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Advanced JSON' }));
    const textareas = screen.getAllByRole('textbox');
    fireEvent.change(textareas[0], { target: { value: '{ invalid json' } });

    fireEvent.click(screen.getByRole('button', { name: 'Start Evaluation' }));

    expect(await screen.findByText(/JSON Parse Error/i)).toBeInTheDocument();
  });
});
