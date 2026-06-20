import { SparklesIcon } from "@heroicons/react/24/outline";
import ThemeSwitcher from "../ThemeSwitcher.jsx";
import { ASK_AI_TABS, TAB_LABELS } from "../tabs/registry.js";

function StatusDot({ online }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
      online
        ? "border-success/30 text-success bg-success/10"
        : "border-error/30 text-error bg-error/10"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-success animate-pulse" : "bg-error"}`} />
      {online ? "Backend Online" : "Backend Offline"}
    </span>
  );
}

export default function AppHeader({ activeTab, backendOnline, onAskAi }) {
  return (
    <header className="h-12 shrink-0 bg-base-200 border-b border-base-300 flex items-center px-4 gap-4 z-30">
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 rounded-md bg-primary text-primary-content flex items-center justify-center font-bold text-xs">
          SL
        </div>
        <span className="text-sm font-bold tracking-tight hidden sm:block">Strategy Lab</span>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-base-content/40">
        <span className="hidden md:block">&middot;</span>
        <span className="hidden md:block text-base-content/60 font-medium">
          {TAB_LABELS[activeTab] || activeTab}
        </span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        {ASK_AI_TABS.has(activeTab) && (
          <button
            type="button"
            className="btn btn-xs btn-ghost border border-primary/25 text-primary gap-1.5"
            onClick={onAskAi}
            title="Ask AI about the current context"
          >
            <SparklesIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Ask AI</span>
          </button>
        )}
        <StatusDot online={backendOnline} />
        <ThemeSwitcher />
      </div>
    </header>
  );
}
