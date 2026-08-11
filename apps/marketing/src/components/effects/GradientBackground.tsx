"use client";

import React from "react";

const blurClassMap = {
  none: "backdrop-blur-none",
  sm: "backdrop-blur-sm",
  md: "backdrop-blur-md",
  lg: "backdrop-blur-lg",
  xl: "backdrop-blur-xl",
  "2xl": "backdrop-blur-2xl",
  "3xl": "backdrop-blur-3xl",
};

export type BlurSize = "none" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";

interface GradientBackgroundProps {
  className?: string;
  backdropBlurAmount?: BlurSize;
  disableGradient?: boolean;
}

function GradientBackground({
  className = "",
  backdropBlurAmount = "sm",
  disableGradient: forceDisable = false,
}: GradientBackgroundProps): React.JSX.Element {
  const finalBlurClass = blurClassMap[backdropBlurAmount] || blurClassMap["sm"];

  if (forceDisable) {
    return <div className={`w-full h-full overflow-hidden bg-black ${className}`} />;
  }

  return (
    <div className={`w-full h-full overflow-hidden bg-black relative ${className}`}>
      {/* Animated gradient using CSS */}
      <div className="absolute inset-0 opacity-100">
        {/* Base gradient layers */}
        <div
          className="absolute inset-0 animate-gradient-shift"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(120, 20, 60, 0.3), transparent 50%), radial-gradient(ellipse 60% 50% at 50% 120%, rgba(0, 20, 60, 0.3), transparent 50%)",
          }}
        />
        <div
          className="absolute inset-0 animate-gradient-shift-reverse"
          style={{
            background:
              "radial-gradient(ellipse 100% 80% at 0% 50%, rgba(180, 30, 80, 0.2), transparent 50%), radial-gradient(ellipse 100% 80% at 100% 50%, rgba(0, 30, 80, 0.2), transparent 50%)",
          }}
        />

        {/* Moving orbs for dynamic effect */}
        <div
          className="absolute w-[500px] h-[500px] rounded-full blur-3xl opacity-20 animate-float-slow"
          style={{
            background: "radial-gradient(circle, rgba(180, 30, 80, 0.8), transparent 70%)",
            top: "10%",
            left: "20%",
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full blur-3xl opacity-20 animate-float-medium"
          style={{
            background: "radial-gradient(circle, rgba(0, 30, 80, 0.8), transparent 70%)",
            bottom: "10%",
            right: "20%",
          }}
        />
        <div
          className="absolute w-[300px] h-[300px] rounded-full blur-3xl opacity-15 animate-float-fast"
          style={{
            background: "radial-gradient(circle, rgba(100, 20, 100, 0.8), transparent 70%)",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        />
      </div>

      {/* Backdrop blur overlay */}
      <div className={`absolute inset-0 ${finalBlurClass}`} />

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes gradient-shift {
          0%,
          100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
          50% {
            transform: scale(1.1) rotate(5deg);
            opacity: 0.8;
          }
        }

        @keyframes gradient-shift-reverse {
          0%,
          100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
          50% {
            transform: scale(1.1) rotate(-5deg);
            opacity: 0.8;
          }
        }

        @keyframes float-slow {
          0%,
          100% {
            transform: translate(0, 0);
          }
          33% {
            transform: translate(30px, -30px);
          }
          66% {
            transform: translate(-20px, 20px);
          }
        }

        @keyframes float-medium {
          0%,
          100% {
            transform: translate(0, 0);
          }
          33% {
            transform: translate(-40px, 30px);
          }
          66% {
            transform: translate(30px, -20px);
          }
        }

        @keyframes float-fast {
          0%,
          100% {
            transform: translate(-50%, -50%);
          }
          33% {
            transform: translate(calc(-50% + 20px), calc(-50% - 30px));
          }
          66% {
            transform: translate(calc(-50% - 30px), calc(-50% + 20px));
          }
        }

        .animate-gradient-shift {
          animation: gradient-shift 15s ease-in-out infinite;
        }

        .animate-gradient-shift-reverse {
          animation: gradient-shift-reverse 20s ease-in-out infinite;
        }

        .animate-float-slow {
          animation: float-slow 25s ease-in-out infinite;
        }

        .animate-float-medium {
          animation: float-medium 18s ease-in-out infinite;
        }

        .animate-float-fast {
          animation: float-fast 12s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

export default GradientBackground;
