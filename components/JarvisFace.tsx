import React, { useEffect, useRef } from 'react';
import { AgentState } from '../types';
import { liveService } from '../services/liveService';

interface JarvisFaceProps {
  state: AgentState;
  tone?: 'calm' | 'alert' | 'empathic';
}

const JarvisFace: React.FC<JarvisFaceProps> = ({ state, tone = 'calm' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const timeRef = useRef<number>(0);
  
  // Physics State for Smoothing (Previous Frame Values)
  const physicsRef = useRef({
      bass: 0,
      mid: 0,
      treble: 0,
      volume: 0,
      driftX: 0,
      driftY: 0,
      blink: 0
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize handler
    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || 300;
      canvas.height = canvas.parentElement?.clientHeight || 300;
    };
    window.addEventListener('resize', resize);
    resize();

    // Particle System
    const particleCount = 180;
    const particles: { x: number; y: number; angle: number; baseRadius: number; speed: number; life: number; offset: number }[] = [];

    // Initialize particles
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: 0, 
        y: 0,
        angle: (Math.PI * 2 * i) / particleCount, 
        baseRadius: 60 + Math.random() * 40,
        speed: 0.002 + Math.random() * 0.005,
        life: Math.random() * Math.PI * 2,
        offset: Math.random() * 100
      });
    }

    // Helper: Linear Interpolation for Smooth Physics
    const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;

    const render = () => {
      timeRef.current += 0.015;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // --- 1. GATHER RAW DATA ---
      let rawVisuals = { volume: 0, bass: 0, mid: 0, treble: 0 };
      
      // Natural Baseline (Breathing & Heartbeat)
      // We combine two sine waves for non-repetitive "organic" feel
      const breathing = (Math.sin(timeRef.current * 0.8) * 0.5 + Math.sin(timeRef.current * 1.3) * 0.5);
      const pulse = Math.pow(Math.abs(Math.sin(timeRef.current * 0.5)), 10) * 0.1; // Occasional heartbeat pulse

      if (state === AgentState.SPEAKING) {
          rawVisuals = liveService.getVoiceVisuals();
      } else {
          // Subtle idle movements
          rawVisuals.bass = 0.15 + breathing * 0.05 + pulse;
          rawVisuals.mid = 0.08 + breathing * 0.02;
          rawVisuals.treble = 0.02;
      }

      // --- 2. EMOTION DYNAMICS CONFIG ---
      let smoothFactor = 0.2; 
      let tension = 1.0;
      let jitterMult = 1.0;
      let expansionMult = 1.0;

      // Color Palette
      let r = 251, g = 191, b = 36; // Gold (Default)

      if (state === AgentState.LISTENING) {
          r = 34; g = 211; b = 238; // Cyan
          smoothFactor = 0.08; 
      } else if (state === AgentState.ERROR) {
          r = 239; g = 68; b = 68; // Red
          jitterMult = 3.0;
          tension = 2.0;
      } else if (state === AgentState.THINKING || state === AgentState.AGENT_PROCESSING) {
          r = 168; g = 85; b = 247; // Purple
          smoothFactor = 0.1;
      } else if (state === AgentState.IDLE) {
          smoothFactor = 0.05; // Slow idle
      } else if (state === AgentState.SPEAKING) {
          // Apply Tone Modifiers
          switch (tone) {
              case 'calm':
                  smoothFactor = 0.15;
                  tension = 0.8;
                  expansionMult = 0.8;
                  break;
              case 'alert':
                  smoothFactor = 0.4;
                  tension = 1.5;
                  jitterMult = 2.0;
                  r = 245; g = 158; b = 11;
                  break;
              case 'empathic':
                  smoothFactor = 0.25;
                  tension = 0.6;
                  expansionMult = 1.2;
                  r = 255; g = 200; b = 100;
                  break;
          }
      }

      // --- 3. PHYSICS SMOOTHING & IDLE ANIMATION ---
      physicsRef.current.bass = lerp(physicsRef.current.bass, rawVisuals.bass, smoothFactor);
      physicsRef.current.mid = lerp(physicsRef.current.mid, rawVisuals.mid, smoothFactor);
      physicsRef.current.treble = lerp(physicsRef.current.treble, rawVisuals.treble, smoothFactor * 1.5);
      physicsRef.current.volume = lerp(physicsRef.current.volume, rawVisuals.volume, smoothFactor);

      // Subtle position drift (simulates head movement)
      const targetDriftX = Math.sin(timeRef.current * 0.3) * 3;
      const targetDriftY = Math.cos(timeRef.current * 0.4) * 2;
      physicsRef.current.driftX = lerp(physicsRef.current.driftX, targetDriftX, 0.02);
      physicsRef.current.driftY = lerp(physicsRef.current.driftY, targetDriftY, 0.02);

      // Periodic "Blink" Effect (Contraction)
      // Trigger a blink every ~6-10 seconds
      if (Math.random() < 0.003 && physicsRef.current.blink === 0) {
          physicsRef.current.blink = 1.0;
      }
      physicsRef.current.blink = lerp(physicsRef.current.blink, 0, 0.15); // Fast return to zero

      const v = physicsRef.current; // Shorthand
      const blinkEffect = 1.0 - (v.blink * 0.4); // 40% contraction during blink

      // --- 4. SHAPE DEFORMATION MATH ---
      const verticalStretch = (1 + (v.bass * 2.5 * expansionMult)) * blinkEffect; 
      const horizontalShake = Math.sin(timeRef.current * 40) * (v.treble * 0.3 * jitterMult); 
      const horizontalStretch = (1 + (v.treble * 0.5 * expansionMult) - (v.bass * 0.2) + horizontalShake);

      const rotationSpeed = (state === AgentState.SPEAKING ? 0.005 : 0.002) * (1 + v.volume * 2);

      // --- 5. RENDER PARTICLES ---
      ctx.globalCompositeOperation = 'screen'; 

      const adjustedCenterX = centerX + v.driftX;
      const adjustedCenterY = centerY + v.driftY;

      particles.forEach((p, i) => {
        p.angle += rotationSpeed * (i % 2 === 0 ? 1 : -1);
        
        let r_dynamic = p.baseRadius + (Math.sin(timeRef.current + p.offset) * 5);
        r_dynamic += (v.mid * 60 * expansionMult);

        if (v.treble > 0.1) {
             r_dynamic += (Math.random() - 0.5) * (v.treble * 30 * jitterMult);
        }

        const x = adjustedCenterX + (Math.cos(p.angle) * r_dynamic * horizontalStretch);
        const y = adjustedCenterY + (Math.sin(p.angle) * r_dynamic * verticalStretch);

        const alpha = (0.2 + (v.mid * 0.8) + (Math.sin(p.life + timeRef.current) * 0.1)) * (1.0 - v.blink * 0.5);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(1, alpha)})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.5 + (v.bass * 3), 0, Math.PI * 2);
        ctx.fill();

        if (v.volume > 0.02 || state !== AgentState.ERROR) {
             const neighbor = particles[(i + 1) % particleCount];
             const nx = adjustedCenterX + (Math.cos(neighbor.angle) * (r_dynamic) * horizontalStretch);
             const ny = adjustedCenterY + (Math.sin(neighbor.angle) * (r_dynamic) * verticalStretch);
             
             const dist = Math.hypot(x - nx, y - ny);
             const connectThresh = 40 + (v.bass * 50);

             if (dist < connectThresh) {
                 ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.3})`;
                 ctx.lineWidth = 0.5 + (v.treble * 1.5);
                 ctx.beginPath();
                 ctx.moveTo(x, y);
                 ctx.lineTo(nx, ny);
                 ctx.stroke();
             }
        }
      });

      // --- 6. INNER GLOW ---
      const coreSize = 10 + (v.bass * 60);
      const coreGradient = ctx.createRadialGradient(adjustedCenterX, adjustedCenterY, 0, adjustedCenterX, adjustedCenterY, coreSize * 2);
      coreGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.1 + v.bass * 0.4})`);
      coreGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      
      ctx.fillStyle = coreGradient;
      ctx.beginPath();
      ctx.ellipse(adjustedCenterX, adjustedCenterY, coreSize * horizontalStretch, coreSize * verticalStretch, 0, 0, Math.PI * 2);
      ctx.fill();

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [state, tone]);

  return (
    <div className="relative w-full h-full flex items-center justify-center">
        {/* Ambient Back Glow - Reacts to Tone */}
        <div className={`absolute w-32 h-32 blur-[80px] opacity-20 rounded-full transition-all duration-1000
             ${state === AgentState.LISTENING ? 'bg-cyan-500' : 
               state === AgentState.ERROR ? 'bg-red-600' : 
               state === AgentState.THINKING || state === AgentState.AGENT_PROCESSING ? 'bg-purple-600' :
               tone === 'alert' ? 'bg-orange-500' : 'bg-stark-gold'}`}
             style={{
                 transform: `translate(${physicsRef.current.driftX * 5}px, ${physicsRef.current.driftY * 5}px)`
             }}></div>
        
        <canvas ref={canvasRef} className="w-full h-full z-10" />
    </div>
  );
};

export default JarvisFace;