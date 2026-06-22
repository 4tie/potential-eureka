import { useState, useEffect } from "react";

export default function CurrentDirective({ events, pipelineStage = null }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (events.length === 0) return;
    
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % events.length);
    }, 2600);

    return () => clearInterval(interval);
  }, [events.length]);

  const currentEvent = events[currentIndex];

  return (
    <div className="min-h-[60px]">
      <div className="font-mono text-[10px] text-muted mb-2">
        {pipelineStage !== null ? `STAGE ${pipelineStage + 1}` : 'CURRENT DIRECTIVE'}
      </div>
      <div className="font-mono text-[15px] text-cyan transition-opacity duration-300 opacity-100">
        {currentEvent ? `${currentEvent.agent} · ${currentEvent.task}` : 'Initializing...'}
      </div>
    </div>
  );
}
