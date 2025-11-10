/* eslint-disable */
// @ts-nocheck

"use client";

import { useEffect, useRef, useState } from "react";

const vertexShader = `
  precision mediump float;
  attribute vec2 a_position;
  varying vec2 v_position;
  void main() {
    v_position = a_position;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision mediump float;
  uniform vec2 iResolution;
  uniform float iTime;
  
  // https://www.iquilezles.org/www/articles/functions/functions.htm
  float pcurve( float x, float a, float b ) {
    float k = pow(a+b,a+b)/(pow(a,a)*pow(b,b));
    return k * pow(x,a) * pow(1.0-x,b);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / iResolution.xy;
    
    float time = iTime * 0.1;
    
    vec3 color = vec3(0.0);
    
    vec3 color1 = vec3(0.0, 0.1, 0.25);
    vec3 color2 = vec3(0.7, 0.1, 0.3);
    
    // first layer
    float f1 = smoothstep(0.2, 0.7, uv.x - 0.2 * sin(time * 1.5 + uv.y * 3.0));
    color = mix(color1, color2, f1);
    
    // second layer
    float f2 = pcurve(uv.y, 0.5 + 0.2 * cos(time * 1.2), 0.5 + 0.2 * sin(time * 1.1)) * (uv.x * 2.0 - 1.0);
    color -= f2 * 0.25;
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

const blurClassMap = {
    sm: "backdrop-blur-sm",
    md: "backdrop-blur-md",
    lg: "backdrop-blur-lg",
    xl: "backdrop-blur-xl",
    "2xl": "backdrop-blur-2xl",
    "3xl": "backdrop-blur-3xl",
  };

  type BlurSize = "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";
  
  interface GradientBackgroundProps {
    className?: string;
    /**
     * `backdrop-blur-sm` is used by default
     */
    backdropBlurAmount?: BlurSize;
    /**
     * If true, the gradient will not be rendered and a solid black background will be used instead.
     */
    disableGradient?: boolean;
  }

function GradientBackground({
    className = "",
    backdropBlurAmount = "sm",
    disableGradient: forceDisable = false,
  }: GradientBackgroundProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isEnabled, setIsEnabled] = useState(!forceDisable);
  
    useEffect(() => {
      // Check for performance hints
      const lowSpec =
        (typeof navigator !== "undefined" && navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 1) ||
        (typeof navigator !== "undefined" && (navigator as any).connection?.saveData);
  
      if (lowSpec || forceDisable) {
        setIsEnabled(false);
      }
      console.log(navigator.hardwareConcurrency)
    }, [forceDisable]);
  
    useEffect(() => {
      if (!isEnabled) return;
  
      const canvas = canvasRef.current!;
      const gl = canvas.getContext("webgl");
      if (!gl) {
        console.error("WebGL not supported");
        setIsEnabled(false);
        return;
      }
  
      const createShader = (type: number, source: string) => {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error("An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader));
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };
  
      const vertexShaderObj = createShader(gl.VERTEX_SHADER, vertexShader);
      const fragmentShaderObj = createShader(gl.FRAGMENT_SHADER, fragmentShader);
  
      const program = gl.createProgram()!;
      gl.attachShader(program, vertexShaderObj!);
      gl.attachShader(program, fragmentShaderObj!);
      gl.linkProgram(program);
  
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Unable to initialize the shader program: " + gl.getProgramInfoLog(program));
        return;
      }
  
      gl.useProgram(program);
  
      const positionAttributeLocation = gl.getAttribLocation(program, "a_position");
      const iResolutionLocation = gl.getUniformLocation(program, "iResolution");
      const iTimeLocation = gl.getUniformLocation(program, "iTime");
  
      const positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      const positions = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  
      gl.enableVertexAttribArray(positionAttributeLocation);
      gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
  
      let startTime = Date.now();
      let animationFrameId: number;
  
      const render = () => {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          gl.viewport(0, 0, width, height);
        }
  
        const currentTime = (Date.now() - startTime) / 1000;
        gl.uniform2f(iResolutionLocation, width, height);
        gl.uniform1f(iTimeLocation, currentTime);
  
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        animationFrameId = requestAnimationFrame(render);
      };
  
      render();
  
      return () => {
        cancelAnimationFrame(animationFrameId);
      };
    }, [isEnabled]);
  
    const finalBlurClass = blurClassMap[backdropBlurAmount as BlurSize] || blurClassMap["sm"];
  
    return (
      <div className={`w-full max-w-screen h-full overflow-hidden bg-black ${className}`}>
        {isEnabled && (
          <>
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full max-w-screen h-full overflow-hidden"
              style={{ display: "block" }}
            />
            <div className={`absolute inset-0 ${finalBlurClass}`} />
          </>
        )}
      </div>
    );
  }
  
  export default GradientBackground;
  