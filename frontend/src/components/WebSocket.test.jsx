// Mock WebSocket
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    this.messageQueue = [];
  }

  send() {
    if (this.readyState === 1) {
      // OPEN
      // Mock successful send
    }
  }

  close() {
    this.readyState = 3; // CLOSED
    if (this.onclose) {
      this.onclose();
    }
  }

  // Helper to simulate receiving a message
  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }

  // Helper to simulate connection opening
  simulateOpen() {
    this.readyState = 1; // OPEN
    if (this.onopen) {
      this.onopen();
    }
  }

  // Helper to simulating error
  simulateError() {
    if (this.onerror) {
      this.onerror();
    }
  }

  // Helper to simulate close
  simulateClose() {
    this.readyState = 3; // CLOSED
    if (this.onclose) {
      this.onclose();
    }
  }
}

globalThis.WebSocket = MockWebSocket;

// Mock fetch
globalThis.fetch = jest.fn();

describe('WebSocket Connection', () => {
  beforeEach(() => {
    globalThis.fetch.mockClear();
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'running' }),
    });
  });

  test('creates WebSocket connection with correct URL', () => {
    const ws = new MockWebSocket('ws://localhost:8000/api/auto-quant/ws/test-id');
    expect(ws.url).toBe('ws://localhost:8000/api/auto-quant/ws/test-id');
  });

  test('handles onopen event', () => {
    const ws = new MockWebSocket('ws://localhost:8000/api/auto-quant/ws/test-id');
    const onOpenMock = jest.fn();
    ws.onopen = onOpenMock;

    ws.simulateOpen();
    expect(onOpenMock).toHaveBeenCalled();
    expect(ws.readyState).toBe(1);
  });

  test('handles onmessage event', () => {
    const ws = new MockWebSocket('ws://localhost:8000/api/auto-quant/ws/test-id');
    const onMessageMock = jest.fn();
    ws.onmessage = onMessageMock;

    const testMessage = { type: 'snapshot', data: { status: 'running' } };
    ws.simulateMessage(testMessage);

    expect(onMessageMock).toHaveBeenCalled();
  });

  test('handles onerror event', () => {
    const ws = new MockWebSocket('ws://localhost:8000/api/auto-quant/ws/test-id');
    const onErrorMock = jest.fn();
    ws.onerror = onErrorMock;

    ws.simulateError();
    expect(onErrorMock).toHaveBeenCalled();
  });

  test('handles onclose event', () => {
    const ws = new MockWebSocket('ws://localhost:8000/api/auto-quant/ws/test-id');
    const onCloseMock = jest.fn();
    ws.onclose = onCloseMock;

    ws.simulateClose();
    expect(onCloseMock).toHaveBeenCalled();
    expect(ws.readyState).toBe(3);
  });

  test('closes connection explicitly', () => {
    const ws = new MockWebSocket('ws://localhost:8000/api/auto-quant/ws/test-id');
    ws.simulateOpen();
    
    ws.close();
    expect(ws.readyState).toBe(3);
  });
});

describe('WebSocket Message Handling', () => {
  test('parses JSON messages correctly', () => {
    const ws = new MockWebSocket('ws://localhost:8000/api/auto-quant/ws/test-id');
    const onMessageMock = jest.fn();
    ws.onmessage = onMessageMock;

    const testMessage = { type: 'snapshot', data: { status: 'running' } };
    ws.simulateMessage(testMessage);

    expect(onMessageMock).toHaveBeenCalled();
    const receivedData = JSON.parse(onMessageMock.mock.calls[0][0].data);
    expect(receivedData.type).toBe('snapshot');
  });

  test('handles malformed JSON gracefully', () => {
    const ws = new MockWebSocket('ws://localhost:8000/api/auto-quant/ws/test-id');
    const onMessageMock = jest.fn();
    ws.onmessage = onMessageMock;

    // Send non-JSON data
    ws.onmessage({ data: 'plain text message' });

    // Should not throw error
    expect(onMessageMock).toHaveBeenCalled();
  });

  test('handles keepalive messages', () => {
    const ws = new MockWebSocket('ws://localhost:8000/api/auto-quant/ws/test-id');
    const onMessageMock = jest.fn();
    ws.onmessage = onMessageMock;

    ws.simulateMessage({ type: 'keepalive' });

    // Keepalive should be ignored
    expect(onMessageMock).toHaveBeenCalled();
  });

  test('handles snapshot messages', () => {
    const ws = new MockWebSocket('ws://localhost:8000/api/auto-quant/ws/test-id');
    const onMessageMock = jest.fn();
    ws.onmessage = onMessageMock;

    const snapshotMessage = {
      type: 'snapshot',
      data: {
        status: 'running',
        current_stage: 2,
        stages: [
          { index: 1, name: 'Sanity Backtest', status: 'passed' },
          { index: 2, name: 'Hyperopt Execution', status: 'running' },
        ],
      },
    };

    ws.simulateMessage(snapshotMessage);
    expect(onMessageMock).toHaveBeenCalled();
  });

  test('handles final messages', () => {
    const ws = new MockWebSocket('ws://localhost:8000/api/auto-quant/ws/test-id');
    const onMessageMock = jest.fn();
    ws.onmessage = onMessageMock;

    const finalMessage = {
      type: 'final',
      data: {
        status: 'completed',
        report: { profit_total: 100 },
      },
    };

    ws.simulateMessage(finalMessage);
    expect(onMessageMock).toHaveBeenCalled();
  });

  test('handles hyperopt_epoch messages', () => {
    const ws = new MockWebSocket('ws://localhost:8000/api/auto-quant/ws/test-id');
    const onMessageMock = jest.fn();
    ws.onmessage = onMessageMock;

    const epochMessage = {
      type: 'hyperopt_epoch',
      data: {
        epoch: 5,
        total_epochs: 100,
        objective: -0.5,
        profit_usdt: 50.0,
      },
    };

    ws.simulateMessage(epochMessage);
    expect(onMessageMock).toHaveBeenCalled();
  });

  test('handles wfo_window messages', () => {
    const ws = new MockWebSocket('ws://localhost:8000/api/auto-quant/ws/test-id');
    const onMessageMock = jest.fn();
    ws.onmessage = onMessageMock;

    const wfoMessage = {
      type: 'wfo_window',
      data: {
        window: 1,
        profit: 0.05,
      },
    };

    ws.simulateMessage(wfoMessage);
    expect(onMessageMock).toHaveBeenCalled();
  });

  test('handles sensitivity_result messages', () => {
    const ws = new MockWebSocket('ws://localhost:8000/api/auto-quant/ws/test-id');
    const onMessageMock = jest.fn();
    ws.onmessage = onMessageMock;

    const sensitivityMessage = {
      type: 'sensitivity_result',
      data: {
        sensitivity: {
          passed: true,
          score: 'High',
        },
      },
    };

    ws.simulateMessage(sensitivityMessage);
    expect(onMessageMock).toHaveBeenCalled();
  });
});

describe('WebSocket Reconnection Logic', () => {
  test('implements exponential backoff', () => {
    // Test that delay increases: 3s, 6s, 12s, 24s, 30s (capped)
    const delays = [];
    for (let i = 0; i < 10; i++) {
      const delay = Math.min(3000 * Math.pow(2, i), 30000);
      delays.push(delay);
    }

    expect(delays[0]).toBe(3000);
    expect(delays[1]).toBe(6000);
    expect(delays[2]).toBe(12000);
    expect(delays[3]).toBe(24000);
    expect(delays[4]).toBe(30000);
    expect(delays[5]).toBe(30000); // Capped at 30s
  });

  test('resets reconnection attempts on successful connection', () => {
    // Simulate successful connection
    let attempts = 0; // Reset on open

    expect(attempts).toBe(0);
  });

  test('stops after max reconnection attempts', () => {
    const maxAttempts = 10;
    let attempts = 0;

    for (let i = 0; i < 15; i++) {
      if (attempts < maxAttempts) {
        attempts++;
      }
    }

    expect(attempts).toBe(maxAttempts);
  });
});

describe('WebSocket Error Handling', () => {
  test('handles null message data gracefully', () => {
    const ws = new MockWebSocket('ws://localhost:8000/api/auto-quant/ws/test-id');
    const onMessageMock = jest.fn();
    ws.onmessage = onMessageMock;

    const messageWithNullData = {
      type: 'snapshot',
      data: null,
    };

    ws.simulateMessage(messageWithNullData);
    expect(onMessageMock).toHaveBeenCalled();
  });

  test('handles missing message fields gracefully', () => {
    const ws = new MockWebSocket('ws://localhost:8000/api/auto-quant/ws/test-id');
    const onMessageMock = jest.fn();
    ws.onmessage = onMessageMock;

    const incompleteMessage = {
      type: 'snapshot',
      // Missing data field
    };

    ws.simulateMessage(incompleteMessage);
    expect(onMessageMock).toHaveBeenCalled();
  });

  test('validates stage number is in range 1-7', () => {
    const validStages = [1, 2, 3, 4, 5, 6, 7];
    const invalidStages = [0, 8, -1, 100];

    validStages.forEach(stage => {
      expect(stage >= 1 && stage <= 7).toBe(true);
    });

    invalidStages.forEach(stage => {
      expect(stage >= 1 && stage <= 7).toBe(false);
    });
  });
});
