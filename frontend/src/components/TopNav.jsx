import { useState, useEffect } from "react";

const PRIMARY_TABS = [
  { id: "auto-quant", label: "AutoQuant" },
  { id: "backtest", label: "Backtest" },
  { id: "results", label: "Results" },
  { id: "settings", label: "Settings" },
];

const DROPDOWN_GROUPS = [
  {
    label: "Strategy",
    tabs: [
      { id: "optimizer", label: "Optimizer" },
      { id: "strategy-lab", label: "Strategy Lab" },
      { id: "strategy-editor", label: "Strategy Editor" },
    ]
  },
  {
    label: "Analysis",
    tabs: [
      { id: "quant", label: "Quant" },
      { id: "performance", label: "Performance" },
      { id: "pair-explorer", label: "Pair Explorer" },
    ]
  },
  {
    label: "Tools",
    tabs: [
      { id: "ai-assistant", label: "AI Assistant" },
      { id: "stress-test", label: "Stress Test" },
    ]
  }
];

function LiveClock() {
  const [time, setTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-US", { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return <span className="font-mono text-xs">{time}</span>;
}

function BrandMark({ backendOnline, isWorkRunning }) {
  const getDotClass = () => {
    if (!backendOnline) return "bg-red pulse-red";
    if (isWorkRunning) return "bg-mint pulse-mint";
    return "bg-mint";
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative w-8 h-8 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet to-cyan opacity-80" />
        <div className="absolute inset-0 rounded-full border-2 border-white/20" />
        <div className={`relative w-2 h-2 rounded-full ${getDotClass()}`} />
      </div>
      <div className="flex flex-col">
        <span className="font-mono text-sm font-medium tracking-wider">4TIE</span>
        <span className="font-mono text-[10px] text-muted bg-white/5 border border-white/10 rounded px-1.5 py-0.5">v1.1</span>
      </div>
    </div>
  );
}

function StatusPill() {
  return (
    <div className="glass-card px-3 py-1.5 flex items-center gap-2">
      <LiveClock />
    </div>
  );
}

function NavDropdown({ group, activeTab, onChange, isOpen, onToggle }) {
  const activeTabInGroup = group.tabs.find(tab => tab.id === activeTab);
  const isActive = !!activeTabInGroup;

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`px-3 py-2 rounded-full text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1 ${
          isActive
            ? "bg-white text-base-100 shadow-lg shadow-white/10"
            : isOpen
            ? "bg-white/10 text-text"
            : "text-text/60 hover:text-text hover:bg-white/5"
        }`}
      >
        {group.label}
        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 glass-card rounded-lg py-1 min-w-[140px] shadow-xl z-[100]">
          {group.tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                onChange(tab.id);
                onToggle();
              }}
              className={`w-full px-3 py-2 text-left text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-white/10 text-text"
                  : "text-text/60 hover:text-text hover:bg-white/5"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TopNav({ activeTab, onChange, backendOnline, isWorkRunning }) {
  const [openDropdown, setOpenDropdown] = useState(null);

  const allTabs = [...PRIMARY_TABS, ...DROPDOWN_GROUPS.flatMap(g => g.tabs)];
  const activeTabLabel = allTabs.find(tab => tab.id === activeTab)?.label || activeTab;

  const toggleDropdown = (groupLabel) => {
    setOpenDropdown(openDropdown === groupLabel ? null : groupLabel);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 glass-card border-b border-white/10 z-50 px-6 flex items-center justify-between">
      <BrandMark backendOnline={backendOnline} isWorkRunning={isWorkRunning} />

      <div className="flex items-center gap-1 bg-white/5 rounded-full p-1 overflow-visible">
        <div className="flex items-center gap-1 overflow-x-auto max-w-[70vw] scrollbar-hide">
          {PRIMARY_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`px-3 py-2 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-white text-base-100 shadow-lg shadow-white/10"
                  : "text-text/60 hover:text-text hover:bg-white/5"
              }`}
              title={tab.label}
            >
              {tab.label}
            </button>
          ))}
          {DROPDOWN_GROUPS.map((group) => (
            <NavDropdown
              key={group.label}
              group={group}
              activeTab={activeTab}
              onChange={onChange}
              isOpen={openDropdown === group.label}
              onToggle={() => toggleDropdown(group.label)}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden md:flex text-xs font-mono text-muted">
          {activeTabLabel}
        </div>
        <StatusPill />
      </div>
    </nav>
  );
}
