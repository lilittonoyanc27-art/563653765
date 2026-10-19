import React, { useEffect, useRef, useState } from 'react';
import type { UserProfile } from './types.ts';
import { sounds } from './audio.ts';

interface StadiumCanvasProps {
  mode: 'penalty' | 'pitch' | 'tactical';
  profile: UserProfile;
  isShooting?: boolean;
  targetZone?: number | null; // 0..4
  keeperDiveZone?: number | null; // 0..4
  onShootZoneSelect?: (zone: number) => void;
  resultMessage?: { es: string; hy: string; isGoal: boolean } | null;
}

export const StadiumCanvas: React.FC<StadiumCanvasProps> = ({
  mode,
  profile,
  isShooting = false,
  targetZone = null,
  keeperDiveZone = null,
  onShootZoneSelect,
  resultMessage = null,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameId = useRef<number | null>(null);
  const [selectedZone, setSelectedZone] = useState<number | null>(targetZone);

  // Ball animation state
  const ballProgress = useRef<number>(0);
  const particles = useRef<Array<{ x: number; y: number; vx: number; vy: number; color: string; life: number }>>([]);

  useEffect(() => {
    setSelectedZone(targetZone);
  }, [targetZone]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let startTime: number | null = null;

    const render = (time: number) => {
      if (!startTime) startTime = time;
      const width = canvas.width;
      const height = canvas.height;

      // 1. Draw Turf Grass Stripes
      ctx.clearRect(0, 0, width, height);

      // Pitch gradient
      const turfStripeHeight = height / 8;
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#15803d' : '#16a34a';
        ctx.fillRect(0, i * turfStripeHeight, width, turfStripeHeight);
      }

      // Stadium floodlight atmosphere
      const gradient = ctx.createRadialGradient(width / 2, height * 0.3, 50, width / 2, height / 2, width * 0.7);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
      gradient.addColorStop(1, 'rgba(6, 78, 59, 0.3)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Field Markings (White lines)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 4;

      if (mode === 'penalty') {
        // Penalty Box & Goal
        const goalW = width * 0.65;
        const goalH = height * 0.38;
        const goalX = (width - goalW) / 2;
        const goalY = height * 0.08;

        // Stadium Crowd Background silhouette
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, goalY);
        // Floodlight flares
        ctx.fillStyle = 'rgba(253, 224, 71, 0.6)';
        ctx.beginPath();
        ctx.arc(width * 0.15, 15, 12, 0, Math.PI * 2);
        ctx.arc(width * 0.85, 15, 12, 0, Math.PI * 2);
        ctx.fill();

        // Goal Frame (White metal bars)
        ctx.fillStyle = '#ffffff';
        // Crossbar
        ctx.fillRect(goalX - 6, goalY - 6, goalW + 12, 10);
        // Left post
        ctx.fillRect(goalX - 6, goalY - 6, 10, goalH + 6);
        // Right post
        ctx.fillRect(goalX + goalW - 4, goalY - 6, 10, goalH + 6);

        // Goal Net (Diamond Pattern)
        ctx.strokeStyle = 'rgba(241, 245, 249, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = goalX; x <= goalX + goalW; x += 18) {
          ctx.moveTo(x, goalY);
          ctx.lineTo(x + 10, goalY + goalH);
        }
        for (let y = goalY; y <= goalY + goalH; y += 14) {
          ctx.moveTo(goalX, y);
          ctx.lineTo(goalX + goalW, y);
        }
        ctx.stroke();

        // Penalty Spot
        const spotX = width / 2;
        const spotY = height * 0.75;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(spotX, spotY, 6, 0, Math.PI * 2);
        ctx.fill();

        // Penalty Arc
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(spotX, spotY, 50, Math.PI * 0.8, Math.PI * 2.2);
        ctx.stroke();

        // Goal Zones (0: top-left, 1: bottom-left, 2: center, 3: top-right, 4: bottom-right)
        const zones = [
          { id: 0, x: goalX + goalW * 0.18, y: goalY + goalH * 0.25 },
          { id: 1, x: goalX + goalW * 0.18, y: goalY + goalH * 0.75 },
          { id: 2, x: goalX + goalW * 0.5, y: goalY + goalH * 0.5 },
          { id: 3, x: goalX + goalW * 0.82, y: goalY + goalH * 0.25 },
          { id: 4, x: goalX + goalW * 0.82, y: goalY + goalH * 0.75 },
        ];

        // Draw Interactive Target Markers
        if (!isShooting && !resultMessage) {
          zones.forEach((z) => {
            const isSel = selectedZone === z.id;
            ctx.fillStyle = isSel ? 'rgba(245, 158, 11, 0.85)' : 'rgba(255, 255, 255, 0.25)';
            ctx.strokeStyle = isSel ? '#ffffff' : 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = isSel ? 3 : 1.5;
            ctx.beginPath();
            ctx.arc(z.x, z.y, isSel ? 22 : 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Inner target crosshair
            ctx.beginPath();
            ctx.moveTo(z.x - 10, z.y);
            ctx.lineTo(z.x + 10, z.y);
            ctx.moveTo(z.x, z.y - 10);
            ctx.lineTo(z.x, z.y + 10);
            ctx.stroke();
          });
        }

        // Draw Goalkeeper
        let keeperX = goalX + goalW * 0.5;
        let keeperY = goalY + goalH * 0.72;

        if (isShooting || resultMessage) {
          const diveTarget = keeperDiveZone !== null ? zones[keeperDiveZone] : zones[2];
          const progress = Math.min(1, ballProgress.current * 1.2);
          keeperX = goalX + goalW * 0.5 + (diveTarget.x - (goalX + goalW * 0.5)) * progress;
          keeperY = goalY + goalH * 0.72 + (diveTarget.y - (goalY + goalH * 0.72)) * progress;
        }

        // Goalkeeper Body
        ctx.save();
        ctx.translate(keeperX, keeperY);
        // Goalkeeper Jersey (Bright neon cyan/orange)
        ctx.fillStyle = '#06b6d4';
        ctx.beginPath();
        ctx.roundRect(-16, -30, 32, 28, 6);
        ctx.fill();
        // Goalkeeper Head
        ctx.fillStyle = '#fbcfe8';
        ctx.beginPath();
        ctx.arc(0, -38, 10, 0, Math.PI * 2);
        ctx.fill();
        // Goalkeeper Gloves
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.arc(-20, -22, 6, 0, Math.PI * 2);
        ctx.arc(20, -22, 6, 0, Math.PI * 2);
        ctx.fill();
        // Goalkeeper Shorts
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-12, -2, 24, 16);
        ctx.restore();

        // Draw Player Razmik behind the ball
        const razmikX = spotX - 35;
        const razmikY = spotY + 30;
        ctx.save();
        ctx.translate(razmikX, razmikY);
        // Jersey
        ctx.fillStyle = profile.jerseyColor || '#16a34a';
        ctx.beginPath();
        ctx.roundRect(-14, -28, 28, 26, 4);
        ctx.fill();
        // Number 10
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(profile.jerseyNumber || 10), 0, -12);
        // Head
        ctx.fillStyle = '#fed7aa';
        ctx.beginPath();
        ctx.arc(0, -36, 9, 0, Math.PI * 2);
        ctx.fill();
        // Hair
        ctx.fillStyle = '#451a03';
        ctx.beginPath();
        ctx.arc(0, -38, 9, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Draw Ball & Trajectory
        let currentBallX = spotX;
        let currentBallY = spotY;
        let ballScale = 1;

        if (isShooting) {
          ballProgress.current = Math.min(1, ballProgress.current + 0.04);
          const target = selectedZone !== null ? zones[selectedZone] : zones[2];
          currentBallX = spotX + (target.x - spotX) * ballProgress.current;
          // Curve arc
          const arcLift = Math.sin(ballProgress.current * Math.PI) * 40;
          currentBallY = spotY + (target.y - spotY) * ballProgress.current - arcLift;
          ballScale = 1 - ballProgress.current * 0.45;
        } else if (resultMessage) {
          const target = selectedZone !== null ? zones[selectedZone] : zones[2];
          currentBallX = target.x;
          currentBallY = target.y;
          ballScale = 0.55;
        } else {
          ballProgress.current = 0;
        }

        // Ball Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(currentBallX, currentBallY + 8 * ballScale, 10 * ballScale, 4 * ballScale, 0, 0, Math.PI * 2);
        ctx.fill();

        // Football
        ctx.save();
        ctx.translate(currentBallX, currentBallY);
        ctx.scale(ballScale, ballScale);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Classic black pentagons on ball
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        for (let p = 0; p < 5; p++) {
          const angle = (p * Math.PI * 2) / 5 + time * 0.005;
          ctx.beginPath();
          ctx.arc(Math.cos(angle) * 8, Math.sin(angle) * 8, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        // Celebration Confetti on Goal
        if (resultMessage?.isGoal) {
          if (particles.current.length < 50) {
            for (let i = 0; i < 30; i++) {
              particles.current.push({
                x: goalX + Math.random() * goalW,
                y: goalY + Math.random() * goalH,
                vx: (Math.random() - 0.5) * 6,
                vy: -Math.random() * 5 - 2,
                color: ['#f59e0b', '#22c55e', '#ef4444', '#3b82f6', '#ec4899'][Math.floor(Math.random() * 5)],
                life: 60,
              });
            }
          }

          particles.current.forEach((p, idx) => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.15; // gravity
            p.life -= 1;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, 4, 4);
          });
          particles.current = particles.current.filter((p) => p.life > 0);
        }
      } else {
        // Full Field View for tactical / general mode
        // Center Circle
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, 60, 0, Math.PI * 2);
        ctx.stroke();

        // Center line
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // Razmik in center
        ctx.save();
        ctx.translate(width / 2, height * 0.6);
        ctx.fillStyle = profile.jerseyColor || '#16a34a';
        ctx.beginPath();
        ctx.roundRect(-16, -30, 32, 28, 4);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(profile.jerseyNumber || 10), 0, -12);

        // Head & hair
        ctx.fillStyle = '#fed7aa';
        ctx.beginPath();
        ctx.arc(0, -38, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#451a03';
        ctx.beginPath();
        ctx.arc(0, -40, 10, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      animFrameId.current = requestAnimationFrame(render);
    };

    animFrameId.current = requestAnimationFrame(render);

    return () => {
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
    };
  }, [mode, profile, isShooting, selectedZone, keeperDiveZone, resultMessage]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== 'penalty' || isShooting || resultMessage) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    const goalW = canvas.width * 0.65;
    const goalH = canvas.height * 0.38;
    const goalX = (canvas.width - goalW) / 2;
    const goalY = canvas.height * 0.08;

    const zones = [
      { id: 0, x: goalX + goalW * 0.18, y: goalY + goalH * 0.25 },
      { id: 1, x: goalX + goalW * 0.18, y: goalY + goalH * 0.75 },
      { id: 2, x: goalX + goalW * 0.5, y: goalY + goalH * 0.5 },
      { id: 3, x: goalX + goalW * 0.82, y: goalY + goalH * 0.25 },
      { id: 4, x: goalX + goalW * 0.82, y: goalY + goalH * 0.75 },
    ];

    let closestZone: number | null = null;
    let minDist = 70;

    zones.forEach((z) => {
      const dist = Math.hypot(clickX - z.x, clickY - z.y);
      if (dist < minDist) {
        minDist = dist;
        closestZone = z.id;
      }
    });

    if (closestZone !== null) {
      setSelectedZone(closestZone);
      sounds.playClick();
      onShootZoneSelect?.(closestZone);
    }
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto rounded-2xl overflow-hidden border-2 border-emerald-500/40 shadow-2xl shadow-emerald-950/50 bg-slate-900">
      <canvas
        ref={canvasRef}
        width={640}
        height={320}
        onClick={handleCanvasClick}
        aria-label="Campo de fútbol interactivo y portería de penalti"
        className="w-full h-auto cursor-pointer block touch-none"
      />

      {/* Interactive Aim Hint Overlay */}
      {mode === 'penalty' && !isShooting && !resultMessage && (
        <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-amber-400/40 text-xs font-semibold text-amber-300 flex items-center gap-1.5 shadow">
          <span>🎯</span>
          <span>Հպվի՛ր դարպասի անկյունին՝ հարվածի ուղղությունն ընտրելու համար</span>
        </div>
      )}

      {/* Shoot Result Banner */}
      {resultMessage && (
        <div
          className={`absolute bottom-3 inset-x-3 p-3 rounded-xl backdrop-blur-md border text-center transition-all animate-bounce ${
            resultMessage.isGoal
              ? 'bg-emerald-950/90 border-emerald-400 text-emerald-100'
              : 'bg-rose-950/90 border-rose-400 text-rose-100'
          }`}
        >
          <div className="text-xl font-bold font-arcade tracking-wider">
            {resultMessage.es}
          </div>
          <div className="text-sm font-medium mt-0.5 opacity-90">
            {resultMessage.hy}
          </div>
        </div>
      )}
    </div>
  );
};
