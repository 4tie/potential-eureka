import { useRef, useEffect } from "react";

const AGENT_COLORS = {
  Orchestrator: "#A78BFA",
  Scout: "#7DD3FC",
  Scribe: "#F472B6",
  Reach: "#E879F9",
  Dev: "#A78BFA",
};

export default function RadarDisplay({ agents }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const centerX = 70;
    const centerY = 70;
    const maxRadius = 62;

    let rotation = 0;

    const draw = () => {
      ctx.clearRect(0, 0, 140, 140);

      // Draw concentric circles
      [62, 46, 30, 14].forEach(radius => {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.stroke();
      });

      // Draw crosshairs
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(140, centerY);
      ctx.moveTo(centerX, 0);
      ctx.lineTo(centerX, 140);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.stroke();

      // Draw sweep line
      rotation += 0.02;
      const sweepX = centerX + Math.cos(rotation) * maxRadius;
      const sweepY = centerY + Math.sin(rotation) * maxRadius;

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(sweepX, sweepY);
      ctx.strokeStyle = '#7DD3FC';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw sweep dot
      ctx.beginPath();
      ctx.arc(sweepX, sweepY, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#7DD3FC';
      ctx.fill();

      // Draw agent dots
      const totalResponses = agents.reduce((sum, agent) => sum + (agent.responses || 0), 0);
      agents.forEach((agent, index) => {
        const angle = (index / agents.length) * Math.PI * 2 - Math.PI / 2;
        const distance = totalResponses > 0 ? ((agent.responses || 0) / totalResponses) * maxRadius * 0.8 : 0;
        const x = centerX + Math.cos(angle) * distance;
        const y = centerY + Math.sin(angle) * distance;

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = AGENT_COLORS[agent.name] || '#A78BFA';
        ctx.fill();
        ctx.shadowColor = AGENT_COLORS[agent.name] || '#A78BFA';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      requestAnimationFrame(draw);
    };

    draw();

    return () => {
      // Cleanup if needed
    };
  }, [agents]);

  return (
    <svg viewBox="0 0 140 140" className="w-[180px] h-[180px]">
      <foreignObject x="0" y="0" width="140" height="140">
        <canvas ref={canvasRef} width={140} height={140} />
      </foreignObject>
    </svg>
  );
}
