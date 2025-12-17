import React, { useEffect, useRef } from 'react';
import { AgentState } from '../types';
import { liveService } from '../services/liveService';

interface JarvisFaceProps {
  state: AgentState;
}

const JarvisFace: React.FC<JarvisFaceProps> = ({ state }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const timeRef = useRef<number>(0);

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
    const particleCount = 200;
    const particles: { x: number; y: number; angle: number; baseRadius: number; speed: number; life: number; phase: number }[] = [];

    // Initialize particles
    for (let i = 0; i < particleCount; i++) {
      const baseRadius = 60 + Math.random() * 60;
      particles.push({
        x: 0, 
        y: 0,
        angle: (Math.PI * 2 * i) / particleCount, // Even distribution
        baseRadius: baseRadius,
        speed: 0.002 + Math.random() * 0.005,
        life: Math.random() * Math.PI * 2,
        phase: Math.random() * Math.PI * 2
      });
    }

    const render = () => {
      timeRef.current += 0.015;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // --- VISUALIZATION DATA GATHERING ---
      let visuals = { volume: 0, bass: 0, mid: 0, treble: 0 };
      
      if (state === AgentState.SPEAKING) {
          visuals = liveService.getVoiceVisuals();
      } else if (state === AgentState.LISTENING) {
          // Slow breathing pulse
          visuals.bass = 0.15 + Math.sin(timeRef.current * 2) * 0.05;
          visuals.mid = 0.1;
      }

      // --- NON-LINEAR RESPONSE CURVES (NOISE GATING) ---
      // Apply cubic curves to make movement punchy. Low volume = very little movement. High volume = explosive movement.
      const vBass = Math.pow(visuals.bass, 2.5);   // Vowels / Jaw Drop
      const vMid = Math.pow(visuals.mid, 2.0);     // Tone
      const vTreble = Math.pow(visuals.treble, 3.0); // Sibilance / Teeth

      // --- COLOR & STATE LOGIC ---
      let primaryColor = '251, 191, 36'; // Gold
      let secondaryColor = '245, 158, 11';
      let stateScale = 1;
      
      if (state === AgentState.LISTENING) {
        primaryColor = '34, 211, 238'; // Cyan
        secondaryColor = '6, 182, 212';
      } else if (state === AgentState.THINKING) {
        primaryColor = '168, 85, 247'; // Purple
        secondaryColor = '147, 51, 234';
      } else if (state === AgentState.ERROR) {
        primaryColor = '239, 68, 68'; // Red
        secondaryColor = '185, 28, 28';
      } else if (state === AgentState.AGENT_PROCESSING) {
        primaryColor = '255, 255, 255'; // White/Blue lightning
        secondaryColor = '59, 130, 246';
      }

      // --- MOUTH SHAPE DEFORMATION (SQUASH & STRETCH) ---
      // Bass (O, A sounds) -> Vertical stretch (ScaleY > 1)
      const verticalStretch = 1 + (vBass * 1.5); 
      // Treble (S, T sounds) -> Horizontal shake/widen
      const horizontalShake = Math.sin(timeRef.current * 50) * vTreble * 0.1;
      const horizontalStretch = 1 + (vTreble * 0.2) - (vBass * 0.3) + horizontalShake;

      // --- RENDER PARTICLES ---
      ctx.globalCompositeOperation = 'screen'; // Glowing effect

      particles.forEach((p, i) => {
        // Orbit
        p.angle += p.speed;
        p.life += 0.05;

        // Base idle motion
        const idleWave = Math.sin(p.angle * 4 + timeRef.current) * 5;
        
        // --- REACTIVE DISPLACEMENT ---
        // 1. Expansion: Particles push out based on total volume
        const expansion = vMid * 40;

        // 2. Jitter: High frequency shake for consonants (Treble)
        const jitter = (Math.random() - 0.5) * vTreble * 25;

        // 3. Radius calculation
        let r = p.baseRadius + idleWave + expansion + jitter;
        
        // Agent Mode: Intense lightning spikes
        if (state === AgentState.AGENT_PROCESSING) {
            r += (Math.random() > 0.9 ? 40 : 0);
        }

        // --- COORDINATE TRANSFORMATION ---
        // Apply elliptical squash/stretch relative to center
        let x = centerX + (Math.cos(p.angle) * r * horizontalStretch);
        let y = centerY + (Math.sin(p.angle) * r * verticalStretch);

        // Update particle
        p.x = x;
        p.y = y;

        // Draw Point
        const alpha = 0.3 + (Math.sin(p.life) * 0.2) + (vMid * 0.5); // Brighter when loud
        ctx.fillStyle = `rgba(${primaryColor}, ${Math.min(1, alpha)})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.5 + (vBass * 2), 0, Math.PI * 2);
        ctx.fill();

        // --- CONNECTING LINES (PLEXUS EFFECT) ---
        // Only connect if close enough. 
        // We optimize by checking only a subset of neighbors or relying on the loop order (since they are sorted by angle)
        // Since they are ordered by angle, p[i] is close to p[i+1]
        
        // Connect to next few neighbors
        for (let j = 1; j <= 4; j++) {
            const neighborIdx = (i + j) % particleCount;
            const p2 = particles[neighborIdx];

            // Distance check
            const dx = x - p2.x;
            const dy = y - p2.y;
            const distSq = dx*dx + dy*dy;
            
            // Dynamic threshold: Connect further when loud (Bass)
            const threshold = 1600 + (vBass * 3000); // 40px^2 -> ~60px^2

            if (distSq < threshold) {
                const dist = Math.sqrt(distSq);
                const lineAlpha = (1 - dist/Math.sqrt(threshold)) * 0.4;
                
                ctx.strokeStyle = `rgba(${secondaryColor}, ${lineAlpha})`;
                ctx.lineWidth = 0.5 + (vTreble * 1); // Thicker lines on consonants
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
        }
      });

      // --- INNER CORE (The Speaker) ---
      // A central glow that represents the "throat" or source of energy
      if (visuals.volume > 0.01 || state === AgentState.LISTENING) {
          const coreRadius = 20 + (vBass * 50);
          const coreAlpha = 0.1 + (vBass * 0.4);
          
          const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreRadius * 2);
          gradient.addColorStop(0, `rgba(${primaryColor}, ${coreAlpha})`);
          gradient.addColorStop(1, `rgba(${primaryColor}, 0)`);
          
          ctx.fillStyle = gradient;
          ctx.beginPath();
          // The core also stretches vertically
          ctx.ellipse(centerX, centerY, coreRadius * horizontalStretch, coreRadius * verticalStretch, 0, 0, Math.PI * 2);
          ctx.fill();
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [state]);

  return (
    <div className="relative w-full h-full flex items-center justify-center">
        {/* Decorative Rings */}
        <div className={`absolute w-72 h-72 rounded-full border border-dashed opacity-10 animate-spin-slow transition-colors duration-500
            ${state === AgentState.LISTENING ? 'border-cyan-500' : 
              state === AgentState.ERROR ? 'border-red-500' : 'border-stark-gold'}`}></div>
        <div className={`absolute w-60 h-60 rounded-full border border-dotted opacity-20 animate-reverse-spin transition-colors duration-500
            ${state === AgentState.LISTENING ? 'border-cyan-500' : 
              state === AgentState.ERROR ? 'border-red-500' : 'border-stark-gold'}`} 
            style={{animationDirection: 'reverse', animationDuration: '15s'}}></div>
            
        <canvas ref={canvasRef} className="w-full h-full z-10" />
        
        {/* Glow Ambient */}
        <div className={`absolute w-32 h-32 blur-[60px] opacity-30 rounded-full transition-colors duration-300
             ${state === AgentState.LISTENING ? 'bg-cyan-500' : 
               state === AgentState.ERROR ? 'bg-red-600' : 
               state === AgentState.AGENT_PROCESSING ? 'bg-blue-400' : 'bg-stark-gold'}`}></div>
    </div>
  );
};

export default JarvisFace;