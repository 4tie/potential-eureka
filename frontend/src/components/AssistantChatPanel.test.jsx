import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AssistantChatPanel from './AssistantChatPanel.jsx';

// Mock the clipboard API
globalThis.navigator.clipboard = {
  writeText: jest.fn().mockResolvedValue(undefined),
};

globalThis.TextDecoder = globalThis.TextDecoder || class {
  decode(value) {
    return Array.from(value || []).map(code => String.fromCharCode(code)).join('');
  }
};

function jsonResponse(payload) {
  return {
    ok: true,
    json: async () => payload,
  };
}

function emptyStreamResponse() {
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => ({ done: true, value: null }),
      }),
    },
  };
}

function streamResponse(text) {
  const chunks = [Uint8Array.from(Array.from(text).map(char => char.charCodeAt(0)))];
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => (
          chunks.length
            ? { done: false, value: chunks.shift() }
            : { done: true, value: null }
        ),
      }),
    },
  };
}

function mockAssistantFetch({
  health = { reachable: true, latency_ms: 12 },
  models = ['llama3'],
  context = { active: {}, warnings: [] },
  stream = emptyStreamResponse,
  streamError = null,
} = {}) {
  return jest.fn(async (url) => {
    const path = String(url);
    if (path.includes('/api/ai/health')) return jsonResponse(health);
    if (path.includes('/api/ai/models')) return jsonResponse({ models, reachable: health.reachable !== false });
    if (path.includes('/api/agent/context')) return jsonResponse(context);
    if (path.includes('/api/ai/chat/stream')) {
      if (streamError) throw streamError;
      return typeof stream === 'function' ? stream() : stream;
    }
    return jsonResponse({});
  });
}

describe('AssistantChatPanel', () => {
  beforeEach(() => {
    globalThis.fetch = mockAssistantFetch({ models: ['llama3', 'mistral'] });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders AI Assistant header with model status', async () => {
    render(<AssistantChatPanel mode="page" />);

    await waitFor(() => {
      expect(screen.getByText('AI Assistant')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/2 models available/)).toBeInTheDocument();
    });
  });

  test('shows capability explanation bar', async () => {
    render(<AssistantChatPanel mode="page" />);

    expect(screen.getByText(/AI Assistant can:/)).toBeInTheDocument();
    expect(screen.getByText(/explain strategies, analyze runs, summarize logs/)).toBeInTheDocument();
    expect(screen.getByText(/Cannot:/)).toBeInTheDocument();
    expect(screen.getByText(/modify files, start trading, or deploy changes/)).toBeInTheDocument();
  });

  test('shows read-only status badge when model is reachable', async () => {
    render(<AssistantChatPanel mode="page" />);

    await waitFor(() => {
      expect(screen.getByText('Read-only')).toBeInTheDocument();
    });
  });

  test('shows Ollama Offline status when model is unreachable', async () => {
    globalThis.fetch = mockAssistantFetch({
      health: { reachable: false, error: 'Could not connect to Ollama' },
      models: [],
    });

    render(<AssistantChatPanel mode="page" />);

    await waitFor(() => {
      expect(screen.getByText('Ollama Offline')).toBeInTheDocument();
    });
  });

  test('renders empty state with context chips and quick questions', async () => {
    globalThis.fetch = mockAssistantFetch({
      context: {
        active: {
          strategy_name: 'DemoStrategy',
          optimizer_session_id: 'opt-1',
        },
        warnings: [],
      },
    });

    render(<AssistantChatPanel mode="page" initialContextOverrides={{ strategy_name: 'DemoStrategy' }} />);

    await waitFor(() => {
      expect(screen.getByText('Attached Context')).toBeInTheDocument();
    });

    expect(screen.getAllByText('DemoStrategy').length).toBeGreaterThan(0);
    expect(screen.getByText('Quick Questions')).toBeInTheDocument();
  });

  test('shows warning when no active context', async () => {
    globalThis.fetch = mockAssistantFetch({
      context: {
        active: {},
        warnings: ['No active run or optimizer session is selected.'],
      },
    });

    render(<AssistantChatPanel mode="page" />);

    await waitFor(() => {
      expect(screen.getByText(/No active run or optimizer session is selected/)).toBeInTheDocument();
    });
  });

  test('shows unavailable message when Ollama is offline', async () => {
    globalThis.fetch = mockAssistantFetch({
      health: { reachable: false, error: 'Ollama not configured' },
      models: [],
    });

    render(<AssistantChatPanel mode="page" />);

    await waitFor(() => {
      expect(screen.getByText(/AI Model Unavailable/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Please check Settings → AI Assistant/)).toBeInTheDocument();
  });

  test('sends message when user submits form', async () => {
    globalThis.fetch = mockAssistantFetch();

    render(<AssistantChatPanel mode="page" />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask about this strategy/)).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/Ask about this strategy/);
    fireEvent.change(textarea, { target: { value: 'Test message' } });

    const sendButton = screen.getByTitle(/Send/);
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/ai/chat/stream', expect.any(Object));
    });
  });

  test('does not send empty message', async () => {
    globalThis.fetch = mockAssistantFetch();

    render(<AssistantChatPanel mode="page" />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask about this strategy/)).toBeInTheDocument();
    });

    const sendButton = screen.getByTitle(/Send/);
    expect(sendButton).toBeDisabled();
  });

  test('sends message on Enter key press', async () => {
    globalThis.fetch = mockAssistantFetch();

    render(<AssistantChatPanel mode="page" />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask about this strategy/)).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/Ask about this strategy/);
    fireEvent.change(textarea, { target: { value: 'Test message' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/ai/chat/stream', expect.any(Object));
    });
  });

  test('does not send message on Shift+Enter', async () => {
    globalThis.fetch = mockAssistantFetch();

    render(<AssistantChatPanel mode="page" />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask about this strategy/)).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/Ask about this strategy/);
    fireEvent.change(textarea, { target: { value: 'Test message' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    // Should not have called the chat endpoint
    expect(globalThis.fetch).not.toHaveBeenCalledWith('/api/ai/chat/stream', expect.any(Object));
  });

  test('quick prompt buttons send expected messages', async () => {
    globalThis.fetch = mockAssistantFetch({
      context: {
        active: {
          strategy_name: 'DemoStrategy',
        },
        warnings: [],
      },
    });

    render(<AssistantChatPanel mode="page" initialContextOverrides={{ strategy_name: 'DemoStrategy' }} />);

    await waitFor(() => {
      expect(screen.getAllByText(/Explain this strategy in plain language/).length).toBeGreaterThan(0);
    });

    const quickPromptButton = screen.getAllByText(/Explain this strategy in plain language/)[0];
    fireEvent.click(quickPromptButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/ai/chat/stream', expect.any(Object));
    });
  });

  test('renders code blocks with copy button', async () => {
    globalThis.fetch = mockAssistantFetch({
      stream: () => streamResponse('event: token\ndata: {"content":"```python\\nprint(\\"hello\\")\\n```"}\n\n'),
    });

    render(<AssistantChatPanel mode="page" />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask about this strategy/)).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/Ask about this strategy/);
    fireEvent.change(textarea, { target: { value: 'Show code' } });
    fireEvent.click(screen.getByTitle(/Send/));

    await waitFor(() => {
      expect(screen.getByText('Copy')).toBeInTheDocument();
    });
  });

  test('copy button copies code to clipboard', async () => {
    globalThis.fetch = mockAssistantFetch({
      stream: () => streamResponse('event: token\ndata: {"content":"```python\\nprint(\\"hello\\")\\n```"}\n\n'),
    });

    render(<AssistantChatPanel mode="page" />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask about this strategy/)).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/Ask about this strategy/);
    fireEvent.change(textarea, { target: { value: 'Show code' } });
    fireEvent.click(screen.getByTitle(/Send/));

    const copyButton = await screen.findByText('Copy');
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalledWith('print("hello")');
    });
  });

  test('shows error message when backend request fails', async () => {
    globalThis.fetch = mockAssistantFetch({ streamError: new Error('Network error') });

    render(<AssistantChatPanel mode="page" />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask about this strategy/)).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/Ask about this strategy/);
    fireEvent.change(textarea, { target: { value: 'Test message' } });

    const sendButton = screen.getByTitle(/Send/);
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText(/Error/)).toBeInTheDocument();
    });
  });

  test('model selector is populated when models are available', async () => {
    globalThis.fetch = mockAssistantFetch({ models: ['llama3', 'mistral', 'codellama'] });

    render(<AssistantChatPanel mode="page" />);

    await waitFor(() => {
      expect(screen.getByTitle('Select AI model')).toBeInTheDocument();
    });

    const modelSelector = screen.getByTitle('Select AI model');
    expect(modelSelector).not.toBeDisabled();
  });

  test('model selector is hidden when no models are available', async () => {
    globalThis.fetch = mockAssistantFetch({ models: [] });

    render(<AssistantChatPanel mode="page" />);

    await waitFor(() => {
      expect(screen.getByText(/0 models available/)).toBeInTheDocument();
    });

    expect(screen.queryByTitle('Select AI model')).not.toBeInTheDocument();
  });

  test('context refresh button calls context endpoint', async () => {
    globalThis.fetch = mockAssistantFetch();

    render(<AssistantChatPanel mode="page" />);

    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });

    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/agent/context'));
    });
  });
});
