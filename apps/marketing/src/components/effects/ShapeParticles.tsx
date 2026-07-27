"use client";

import { useEffect, useRef, useCallback } from "react";

interface Particle {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  targetX: number;
  targetY: number;
  vx: number;
  vy: number;
  size: number;
}

interface ShapeParticlesProps {
  shape?: "diamond" | "circle" | "square" | "wave";
  particleCount?: number;
  className?: string;
  // Physics props
  interactionRadius?: number; // How far mouse affects particles
  repelForce?: number; // How strongly particles are pushed away
  returnForce?: number; // How quickly particles return to base
  damping?: number; // Velocity damping (0-1, higher = more friction)
  maxVelocity?: number; // Maximum particle velocity
  // Visual props
  particleOpacity?: number;
  connectionOpacity?: number;
  connectionDistance?: number;
  particleColor?: string;
}

export const ShapeParticles = ({
  shape = "diamond",
  particleCount = 150,
  className = "",
  // Physics defaults - more bouncy and fluid
  interactionRadius = 150,
  repelForce = 1.2,
  returnForce = 0.02,
  damping = 0.85,
  maxVelocity = 8,
  // Visual defaults
  particleOpacity = 0.4,
  connectionOpacity = 0.2,
  connectionDistance = 80,
  particleColor = "100, 150, 255",
}: ShapeParticlesProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });
  const animationFrameRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate points for different shapes
  const generateShapePoints = useCallback(
    (count: number, shapeType: string, width: number, height: number) => {
      const points: { x: number; y: number }[] = [];
      const centerX = width / 2;
      const centerY = height / 2;
      const size = Math.min(width, height) * 0.35;

      switch (shapeType) {
        case "diamond": {
          for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const radius = size * (1 + Math.random() * 0.1);
            const t = angle;
            const diamondRadius = radius / (Math.abs(Math.cos(t)) + Math.abs(Math.sin(t)));

            points.push({
              x: centerX + Math.cos(angle) * diamondRadius,
              y: centerY + Math.sin(angle) * diamondRadius,
            });
          }
          break;
        }
        case "circle": {
          for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const radius = size * (0.9 + Math.random() * 0.2);
            points.push({
              x: centerX + Math.cos(angle) * radius,
              y: centerY + Math.sin(angle) * radius,
            });
          }
          break;
        }
        case "square": {
          const perimeter = 4;
          for (let i = 0; i < count; i++) {
            const t = (i / count) * perimeter;
            let x, y;

            if (t < 1) {
              x = centerX - size + t * size * 2;
              y = centerY - size;
            } else if (t < 2) {
              x = centerX + size;
              y = centerY - size + (t - 1) * size * 2;
            } else if (t < 3) {
              x = centerX + size - (t - 2) * size * 2;
              y = centerY + size;
            } else {
              x = centerX - size;
              y = centerY + size - (t - 3) * size * 2;
            }

            points.push({ x, y });
          }
          break;
        }
        case "wave": {
          for (let i = 0; i < count; i++) {
            const t = (i / count) * Math.PI * 4;
            const x = centerX + (t - Math.PI * 2) * (size / 2);
            const y = centerY + Math.sin(t) * size * 0.5;
            points.push({ x, y });
          }
          break;
        }
        default:
          return points;
      }

      return points;
    },
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      initParticles();
    };

    const initParticles = () => {
      const points = generateShapePoints(particleCount, shape, canvas.width, canvas.height);

      if (particlesRef.current.length === 0) {
        particlesRef.current = points.map((point) => ({
          x: point.x,
          y: point.y,
          baseX: point.x,
          baseY: point.y,
          targetX: point.x,
          targetY: point.y,
          vx: 0,
          vy: 0,
          size: 1.5 + Math.random() * 1.5,
        }));
      } else {
        particlesRef.current.forEach((particle, i) => {
          if (points[i]) {
            particle.targetX = points[i].x;
            particle.targetY = points[i].y;
            particle.baseX = points[i].x;
            particle.baseY = points[i].y;
          }
        });
      }
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas, {});

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    canvas.addEventListener("mousemove", handleMouseMove, {});

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const mouse = mouseRef.current;

      particlesRef.current.forEach((particle) => {
        // Mouse interaction - repel particles
        const dx = mouse.x - particle.x;
        const dy = mouse.y - particle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < interactionRadius) {
          const force = ((interactionRadius - distance) / interactionRadius) * repelForce;
          const angle = Math.atan2(dy, dx);

          // Push away from mouse
          particle.vx -= Math.cos(angle) * force;
          particle.vy -= Math.sin(angle) * force;
        }

        // Return to base position (spring force)
        particle.vx += (particle.targetX - particle.x) * returnForce;
        particle.vy += (particle.targetY - particle.y) * returnForce;

        // Apply damping (friction)
        particle.vx *= damping;
        particle.vy *= damping;

        // Clamp velocity to max
        const speed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
        if (speed > maxVelocity) {
          particle.vx = (particle.vx / speed) * maxVelocity;
          particle.vy = (particle.vy / speed) * maxVelocity;
        }

        // Update position
        particle.x += particle.vx;
        particle.y += particle.vy;

        // Draw particle
        const opacity = particleOpacity + (particle.size / 3) * 0.3;
        ctx.fillStyle = `rgba(${particleColor}, ${opacity})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw connections
      for (let i = 0; i < particlesRef.current.length; i++) {
        const p1 = particlesRef.current[i];
        const nextIndex = (i + 1) % particlesRef.current.length;
        const p2 = particlesRef.current[nextIndex];

        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < connectionDistance) {
          const opacity = (1 - distance / connectionDistance) * connectionOpacity;
          ctx.strokeStyle = `rgba(${particleColor}, ${opacity})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      canvas.removeEventListener("mousemove", handleMouseMove);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    shape,
    particleCount,
    generateShapePoints,
    interactionRadius,
    repelForce,
    returnForce,
    damping,
    maxVelocity,
    particleOpacity,
    connectionOpacity,
    connectionDistance,
    particleColor,
  ]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-auto" />
    </div>
  );
};
