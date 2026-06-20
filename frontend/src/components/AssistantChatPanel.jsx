import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../services/api.js";
import {
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
  ShieldCheckIcon,
  SparklesIcon,
  XMarkIcon,
  ClipboardDocumentIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";

function compactId(value) {
  if (!value) return null;
  const text = String(value);
  return text.length > 10 ? `${text.slice(0, 8)}...` : text;
}

function summarizeContext(context) {
  const active = context?.active || {};
  const optimizer = context?.optimizer || {};
  const chips = [];
  if (active.strategy_name) chips.push({ kind: "Strategy", label: active.strategy_name });
  if (active.optimizer_session_id) chips.push({ kind: "Optimizer", label: compactId(active.optimizer_session_id) });
  if (active.optimizer_trial_number) chips.push({ kind: "Trial", label: `#${active.optimizer_trial_number}` });
  if (optimizer?.summary?.best_trial_number != null) chips.push({ kind: "Best", label: `#${optimizer.summary.best_trial_number}` });
  if (active.backtest_run_id) chips.push({ kind: "Backtest", label: compactId(active.backtest_run_id) });
  if (active.auto_quant_run_id) chips.push({ kind: "AutoQuant", label: compactId(active.auto_quant_run_id) });
  return {
    active_tab: active.active_tab || context?.app?.active_tab || null,
    active_panel: active.active_panel || context?.app?.active_panel || null,
    strategy_name: active.strategy_name || null,
    optimizer_session_id: active.optimizer_session_id || null,
    optimizer_trial_number: active.optimizer_trial_number || null,
    backtest_run_id: active.backtest_run_id || null,
    auto_quant_run_id: active.auto_quant_run_id || null,
    chips,
    warnings: context?.warnings || [],
  };
}

function suggestionsFor(summary) {
  if (summary?.optimizer_session_id) {
    return [
      "Explain why the best optimizer trial is winning.",
      "Which parameter groups should I review next?",
      "Prepare a conservative optimizer run draft.",
    ];
  }
  if (summary?.backtest_run_id) {
    return [
      "Why did this backtest lose money?",
      "Are drawdown and trade count reliable here?",
      "Which pair or exit behavior needs review?",
    ];
  }
  if (summary?.auto_quant_run_id) {
    return [
      "Summarize this AutoQuant run.",
      "What failed and what should I try next?",
      "Explain the readiness and validation signals.",
    ];
  }
  if (summary?.strategy_name) {
    return [
      "Explain this strategy in plain language.",
      "Which parameters are most worth reviewing?",
      "What data is missing before analysis?",
    ];
  }
  return [
    "What context is currently attached?",
    "What should I inspect first?",
    "Explain how to use this assistant safely.",
  ];
}

function renderContent(text) {
  return String(text || "").split("\n").map((line, idx) => (
    <span key={idx}>
      {line}
      {idx < String(text || "").split("\n").length - 1 && <br />}
    </span>
  ));
}

function isCodeBlock(text) {
  return typeof text === 'string' && text.includes('```');
}

function renderMessageWithCode(content) {
  if (!content) return null;
  
  const lines = content.split('\n');
  const segments = [];
  let inCode = false;
  let codeLanguage = '';
  let codeContent = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      if (inCode) {
        // Closing code block
        segments.push({
          type: 'code',
          language: codeLanguage,
          content: codeContent.join('\n')
        });
        codeContent = [];
        codeLanguage = '';
        inCode = false;
      } else {
        // Opening code block
        if (segments.length > 0 && segments[segments.length - 1].type === 'text') {
          segments[segments.length - 1].content += '\n';
        }
        codeLanguage = line.trim().replace('```', '').trim() || 'text';
        inCode = true;
      }
    } else if (inCode) {
      codeContent.push(line);
    } else {
      if (segments.length === 0 || segments[segments.length - 1].type !== 'text') {
        segments.push({ type: 'text', content: line });
      } else {
        segments[segments.length - 1].content += (segments[segments.length - 1].content ? '\n' : '') + line;
      }
    }
  }
  
  // Handle unclosed code block
  if (inCode && codeContent.length > 0) {
    segments.push({
      type: 'code',
      language: codeLanguage,
      content: codeContent.join('\n')
    });
  }
  
  return segments.map((segment, idx) => {
    if (segment.type === 'code') {
      return <CodeBlock key={`code-${idx}`} language={segment.language} content={segment.content} />;
    }
    return <span key={`text-${idx}`}>{renderContent(segment.content)}</span>;
  });
}

function CodeBlock({ language, content }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  return (
    <div className="my-2 rounded-lg bg-base-300 border border-base-400 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-base-400/30 border-b border-base-400">
        <span className="text-[10px] font-mono text-base-content/60">{language}</span>
        <button
          onClick={handleCopy}
          className="btn btn-ghost btn-xs px-1.5 py-0.5 h-5 min-h-0 gap-1 text-[10px]"
          title="Copy to clipboard"
        >
          {copied ? <CheckIcon className="h-3 w-3" /> : <ClipboardDocumentIcon className="h-3 w-3" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-3 text-xs font-mono overflow-x-auto text-base-content/90 whitespace-pre-wrap break-all">
        {content}
      </pre>
    </div>
  );
}

function SafetyBadge({ safety }) {
  const classes = safety === "Needs confirmation"
    ? "border-warning/30 bg-warning/10 text-warning"
    : safety === "Destructive"
      ? "border-error/30 bg-error/10 text-error"
      : "border-success/30 bg-success/10 text-success";
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold ${classes}`}>
      {safety === "Read-only" && <ShieldCheckIcon className="h-3 w-3" />}
      {safety}
    </span>
  );
}

function ContextChips({ summary }) {
  const chips = summary?.chips || [];
  if (!chips.length) {
    return <div className="text-xs text-base-content/35">No active run context</div>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip, idx) => (
        <span key={`${chip.kind}-${idx}`} className="badge badge-sm badge-ghost gap-1 max-w-full">
          <span className="text-base-content/40">{chip.kind}</span>
          <span className="font-mono truncate">{chip.label}</span>
        </span>
      ))}
    </div>
  );
}

export default function AssistantChatPanel({
  mode = "page",
  initialContextOverrides = null,
  onClose = null,
}) {
  const [contextOverrides, setContextOverrides] = useState(initialContextOverrides || {});
  const [contextSummary, setContextSummary] = useState(null);
  const [modelState, setModelState] = useState({ loading: true, reachable: false, models: [], error: "", health: null });
  const [messages, setMessages] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [actions, setActions] = useState([]);
  const [includeStrategySource, setIncludeStrategySource] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const scrollerRef = useRef(null);

  useEffect(() => {
    setContextOverrides(initialContextOverrides || {});
  }, [initialContextOverrides]);

  const checkOllamaHealth = useCallback(async () => {
    try {
      const healthRes = await fetch("/api/ai/health");
      const healthData = await healthRes.json();

      if (healthData.reachable) {
        const modelsRes = await fetch("/api/ai/models");
        const modelsData = await modelsRes.json();

        setModelState({
          loading: false,
          reachable: true,
          models: modelsData.models || [],
          error: "",
          health: healthData,
        });
      } else {
        setModelState({
          loading: false,
          reachable: false,
          models: [],
          error: healthData.error || "Ollama unreachable",
          health: healthData,
        });
      }
    } catch {
      setModelState({
        loading: false,
        reachable: false,
        models: [],
        error: "Failed to check Ollama status",
        health: null,
      });
    }
  }, []);

  useEffect(() => {
    if (modelState.loading) {
      checkOllamaHealth();
    }
  }, [modelState.loading, checkOllamaHealth]);

  const refreshContext = useCallback(() => {
    api.ai.getContext(contextOverrides)
      .then(data => setContextSummary(summarizeContext(data)))
      .catch(() => setContextSummary(summarizeContext({ active: contextOverrides, warnings: ["Context snapshot unavailable."] })));
  }, [contextOverrides]);

  useEffect(() => {
    refreshContext();
  }, [refreshContext]);

  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messages, loading]);

  const suggestedQuestions = useMemo(() => suggestionsFor(contextSummary), [contextSummary]);

  const appendActionResult = (title, result) => {
    setMessages(prev => [...prev, {
      id: `action-${Date.now()}`,
      role: "assistant",
      content: `${title}\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
    }]);
  };

  const sendNonStreaming = async (messageText, assistantId) => {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: messageText,
        session_id: sessionId,
        model: selectedModel || undefined,
        context_overrides: contextOverrides,
        include_strategy_source: includeStrategySource,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Assistant request failed.");
    setSessionId(data.session_id);
    setContextSummary(data.context_summary);
    setActions(data.available_actions || []);
    setMessages(prev => prev.map(msg => (
      msg.id === assistantId ? { ...msg, content: data.message?.content || "" } : msg
    )));
  };

  const parseSseEvent = (chunk) => {
    const event = { type: "message", data: "" };
    chunk.split("\n").forEach(line => {
      if (line.startsWith("event:")) event.type = line.slice(6).trim();
      if (line.startsWith("data:")) event.data += line.slice(5).trim();
    });
    if (!event.data) return null;
    try {
      return { type: event.type, data: JSON.parse(event.data) };
    } catch {
      return null;
    }
  };

  const sendStreaming = async (messageText, assistantId) => {
    const res = await fetch("/api/ai/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: messageText,
        session_id: sessionId,
        model: selectedModel || undefined,
        context_overrides: contextOverrides,
        include_strategy_source: includeStrategySource,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "Assistant request failed.");
    }
    if (!res.body || !res.body.getReader) {
      await sendNonStreaming(messageText, assistantId);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        const event = parseSseEvent(part);
        if (!event) continue;
        if (event.type === "meta") {
          setSessionId(event.data.session_id);
          setContextSummary(event.data.context_summary);
          setActions(event.data.available_actions || []);
        }
        if (event.type === "token") {
          setMessages(prev => prev.map(msg => (
            msg.id === assistantId ? { ...msg, content: `${msg.content}${event.data.content || ""}` } : msg
          )));
        }
        if (event.type === "done") {
          setSessionId(event.data.session_id);
          setContextSummary(event.data.context_summary);
          setActions(event.data.available_actions || []);
        }
        if (event.type === "error") {
          throw new Error(event.data.detail || "Assistant stream failed.");
        }
      }
    }
  };

  const sendMessage = async (text = input) => {
    const messageText = String(text || "").trim();
    if (!messageText || loading) return;
    setInput("");
    setError("");
    setLoading(true);
    const assistantId = `assistant-${Date.now()}`;
    setMessages(prev => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content: messageText },
      { id: assistantId, role: "assistant", content: "" },
    ]);
    try {
      await sendStreaming(messageText, assistantId);
    } catch (err) {
      setError(err.message);
      setMessages(prev => prev.map(msg => (
        msg.id === assistantId ? { ...msg, content: `Assistant unavailable: ${err.message}` } : msg
      )));
    } finally {
      setLoading(false);
    }
  };

  const runAction = async (action, confirmed = false) => {
    if (action.safety === "Destructive") return;
    if (action.safety === "Needs confirmation" && !confirmed) {
      setPendingAction(action);
      return;
    }
    setActionBusy(true);
    setError("");
    try {
      const res = await fetch("/api/ai/actions/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_type: action.action_type,
          payload: action.payload || {},
          session_id: sessionId,
          user_message: messages.filter(m => m.role === "user").at(-1)?.content || null,
          confirmation_token: action.safety === "Needs confirmation" ? "CONFIRM" : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Action failed.");
      appendActionResult(action.label, data);
      setPendingAction(null);
      refreshContext();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  };

  const containerClass = mode === "drawer"
    ? "h-full flex flex-col bg-base-100"
    : "h-full min-h-[calc(100vh-3rem)] flex flex-col bg-base-100";

  return (
    <div className={containerClass}>
      <header className="shrink-0 border-b border-base-300 bg-base-200/80 px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-md bg-primary text-primary-content flex items-center justify-center">
          <SparklesIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold tracking-tight">AI Assistant</div>
          <div className="text-[10px] text-base-content/40 truncate">
            {modelState.loading
              ? "Checking Ollama..."
              : modelState.reachable
                ? `${modelState.models.length || 0} model${modelState.models.length === 1 ? "" : "s"} available` +
                  (modelState.health?.latency_ms ? ` (${modelState.health.latency_ms}ms)` : "")
                : modelState.error || "Ollama Offline"}
          </div>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost btn-xs border border-base-300"
            onClick={() => setModelState(prev => ({ ...prev, loading: true }))}
            disabled={modelState.loading}
            title="Refresh Ollama status"
          >
            <SparklesIcon className="h-3 w-3" />
          </button>
          <span className={`hidden sm:inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold ${
            modelState.reachable ? "border-success/30 bg-success/10 text-success" : "border-error/30 bg-error/10 text-error"
          }`}>
            {modelState.reachable ? "Read-only" : "Ollama Offline"}
          </span>
          {onClose && (
            <button className="btn btn-ghost btn-sm btn-square" onClick={onClose} title="Close AI Assistant">
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>
      
      {/* Capability Explanation Bar */}
      <div className="shrink-0 border-b border-base-300 bg-base-100/50 px-4 py-2">
        <div className="text-[11px] text-base-content/60">
          <span className="font-medium">AI Assistant can:</span> explain strategies, analyze runs, summarize logs, and suggest improvements. 
          <span className="font-medium ml-1">Cannot:</span> modify files, start trading, or deploy changes without confirmation.
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-h-0 flex flex-col border-r border-base-300/70">
          <div ref={scrollerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="py-6 space-y-4">
                <div className="rounded-lg border border-base-300 bg-base-200/45 px-4 py-3">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">Attached Context</div>
                    <button className="btn btn-ghost btn-xs border border-base-300" onClick={refreshContext}>Refresh</button>
                  </div>
                  <ContextChips summary={contextSummary} />
                  {contextSummary?.warnings?.length > 0 && (
                    <div className="mt-3 text-[11px] text-warning">
                      {contextSummary.warnings.slice(0, 2).join(" ")}
                    </div>
                  )}
                </div>
                
                {modelState.reachable ? (
                  <>
                    <div className="rounded-lg border border-base-300 bg-base-200/30 px-4 py-3">
                      <div className="text-xs font-semibold text-base-content/60 uppercase tracking-wider mb-2">Quick Questions</div>
                      <div className="flex flex-wrap gap-2">
                        {suggestedQuestions.map(q => (
                          <button key={q} className="btn btn-sm btn-ghost border border-base-300 normal-case" onClick={() => sendMessage(q)}>
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <div className="rounded-lg border border-info/30 bg-info/5 px-4 py-3">
                      <div className="flex items-start gap-2">
                        <ShieldCheckIcon className="h-4 w-4 text-info mt-0.5 shrink-0" />
                        <div className="text-[11px] text-base-content/70">
                          <span className="font-medium text-info">Safe & Read-only:</span> This assistant analyzes your strategies, runs, and logs to provide insights. 
                          It cannot modify files, start trading, or deploy changes without your explicit confirmation.
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
                    <div className="flex items-start gap-2">
                      <ExclamationTriangleIcon className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                      <div className="text-[11px] text-warning/90">
                        <span className="font-medium">AI Model Unavailable:</span> The assistant requires Ollama to be configured and running. 
                        Please check Settings → AI Assistant to configure your Ollama instance.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {messages.map(message => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] rounded-lg border px-3 py-2 text-sm leading-relaxed ${
                  message.role === "user"
                    ? "bg-primary text-primary-content border-primary"
                    : "bg-base-200 border-base-300 text-base-content/85"
                }`}>
                  {message.content ? (
                    isCodeBlock(message.content) ? renderMessageWithCode(message.content) : renderContent(message.content)
                  ) : (
                    <span className="loading loading-dots loading-sm" />
                  )}
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="mx-4 mb-2 rounded border border-error/30 bg-error/10 px-3 py-2 text-xs text-error flex gap-2 items-start">
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-medium">Error:</span> {error}
                {!modelState.reachable && (
                  <div className="mt-1 text-[11px] opacity-80">
                    Please check your Ollama connection in Settings or ensure the service is running.
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="shrink-0 border-t border-base-300 bg-base-200/45 p-3">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {modelState.models.length > 0 && (
                <select
                  className="select select-bordered select-xs w-32"
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  disabled={loading || !modelState.reachable}
                  title="Select AI model"
                >
                  <option value="">Default model</option>
                  {modelState.models.map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              )}
              <select
                className="select select-bordered select-xs w-36"
                value="current"
                onChange={() => {}}
                title="Assistant context source"
                disabled={loading}
              >
                <option value="current">Current context</option>
              </select>
              <label className="inline-flex items-center gap-2 text-[11px] text-base-content/55">
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs checkbox-primary"
                  checked={includeStrategySource}
                  onChange={e => setIncludeStrategySource(e.target.checked)}
                  disabled={loading}
                />
                Attach source
              </label>
            </div>
            <form
              className="flex items-end gap-2"
              onSubmit={e => {
                e.preventDefault();
                sendMessage();
              }}
            >
              <textarea
                className="textarea textarea-bordered flex-1 min-h-[52px] max-h-32 text-sm resize-none"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Ask about this strategy, run, optimizer session, or report..."
                disabled={loading}
              />
              <button 
                className="btn btn-primary btn-square" 
                disabled={loading || !input.trim()} 
                title={loading ? "Sending..." : "Send (Enter)"}
              >
                {loading ? <span className="loading loading-spinner loading-sm" /> : <PaperAirplaneIcon className="h-5 w-5" />}
              </button>
            </form>
          </div>
        </section>

        <aside className="hidden xl:flex min-h-0 flex-col bg-base-200/30">
          <div className="p-4 border-b border-base-300">
            <div className="text-[10px] font-semibold text-base-content/40 uppercase tracking-wider mb-2">Context</div>
            <ContextChips summary={contextSummary} />
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-base-content/50">
              <span>Tab</span><span className="font-mono text-right truncate">{contextSummary?.active_tab || "-"}</span>
              <span>Panel</span><span className="font-mono text-right truncate">{contextSummary?.active_panel || "-"}</span>
              <span>Strategy</span><span className="font-mono text-right truncate">{contextSummary?.strategy_name || "-"}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="text-[10px] font-semibold text-base-content/40 uppercase tracking-wider">Suggested Questions</div>
            <div className="space-y-2">
              {suggestedQuestions.map(q => (
                <button key={q} className="btn btn-sm btn-ghost border border-base-300 w-full justify-start normal-case h-auto min-h-9 text-left" onClick={() => sendMessage(q)}>
                  {q}
                </button>
              ))}
            </div>

            {actions.length > 0 && (
              <>
                <div className="pt-2 text-[10px] font-semibold text-base-content/40 uppercase tracking-wider">Actions</div>
                <div className="space-y-2">
                  {actions.map(action => (
                    <button
                      key={`${action.action_type}-${JSON.stringify(action.payload || {})}`}
                      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                        action.safety === "Destructive"
                          ? "border-error/20 bg-error/5 opacity-60 cursor-not-allowed"
                          : "border-base-300 bg-base-100/70 hover:border-primary/40"
                      }`}
                      disabled={action.safety === "Destructive" || actionBusy}
                      onClick={() => runAction(action)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold">{action.label}</span>
                        <SafetyBadge safety={action.safety} />
                      </div>
                      <div className="mt-1 text-[11px] text-base-content/45 leading-snug">{action.description}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </aside>
      </div>

      {pendingAction && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-lg">
            <h3 className="font-bold text-base mb-2">Confirm Assistant Action</h3>
            <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning mb-3">
              {pendingAction.description}
            </div>
            <div className="text-xs space-y-2">
              <div className="flex justify-between gap-3"><span className="text-base-content/45">Action</span><span className="font-mono text-right">{pendingAction.action_type}</span></div>
              <div className="flex justify-between gap-3"><span className="text-base-content/45">Safety</span><SafetyBadge safety={pendingAction.safety} /></div>
              <pre className="max-h-48 overflow-auto rounded bg-base-300/40 p-2 text-[10px] whitespace-pre-wrap break-all">
                {JSON.stringify(pendingAction.payload || {}, null, 2)}
              </pre>
            </div>
            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setPendingAction(null)} disabled={actionBusy}>Cancel</button>
              <button className="btn btn-warning btn-sm" onClick={() => runAction(pendingAction, true)} disabled={actionBusy}>
                {actionBusy ? <><span className="loading loading-spinner loading-xs" />Confirming</> : "Confirm"}
              </button>
            </div>
          </div>
          <div className="modal-backdrop bg-black/40" onClick={() => !actionBusy && setPendingAction(null)} />
        </dialog>
      )}
    </div>
  );
}
