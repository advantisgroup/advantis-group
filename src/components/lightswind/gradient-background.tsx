/* eslint-disable */
// @ts-nocheck

'use client'

import { useIsMobile } from '@/hooks/use-mobile'
import React, { useEffect, useRef, useState } from 'react'

const vertexShaderSource = `
  precision mediump float;
  attribute vec2 a_position;
  varying vec2 v_position;
  void main() {
    v_position = a_position;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

const fragmentShaderLowSpec = `
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
`

const fragmentShaderHighSpec = `
#ifdef GL_ES
precision mediump float;
#endif

uniform vec2 iResolution;
uniform float iTime;

float cosRange(float amt, float range, float minimum) {
  return (((1.0 + cos(radians(amt))) * 0.5) * range) + minimum;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  const int zoom = 40;
  const float brightness = 0.975;
  float time = iTime * 1.25;
  vec2 uv = fragCoord.xy / iResolution.xy;
  vec2 p  = (2.0 * fragCoord.xy - iResolution.xy) / max(iResolution.x, iResolution.y);
  float ct = cosRange(time * 5.0, 3.0, 1.1);
  float xBoost = cosRange(time * 0.2, 5.0, 5.0);
  float yBoost = cosRange(time * 0.1, 10.0, 5.0);
  float fScale = cosRange(time * 15.5, 1.25, 0.5);

  for (int i = 1; i < zoom; i++) {
    float _i = float(i);
    vec2 newp = p;
    newp.x += 0.25 / _i * sin(_i * p.y + time * cos(ct) * 0.5 / 20.0 + 0.005 * _i) * fScale + xBoost;
    newp.y += 0.25 / _i * sin(_i * p.x + time * ct * 0.3 / 40.0 + 0.03 * float(i + 15)) * fScale + yBoost;
    p = newp;
  }

  vec3 col = vec3(
    0.5 * sin(3.0 * p.x) + 0.5,
    0.5 * sin(3.0 * p.y) + 0.5,
    sin(p.x + p.y)
  );
  col *= brightness;

  float vigAmt = 5.0;
  float vignette = (1. - vigAmt * (uv.y - 0.5) * (uv.y - 0.5)) * (1. - vigAmt * (uv.x - 0.5) * (uv.x - 0.5));
  float extrusion = (col.x + col.y + col.z) / 4.0;
  extrusion *= 1.5;
  extrusion *= vignette;

  fragColor = vec4(col, extrusion);
}

void main() {
  mainImage(gl_FragColor, gl_FragCoord.xy);
}
`

const blurClassMap = {
    none: 'backdrop-blur-none',
    sm: 'backdrop-blur-sm',
    md: 'backdrop-blur-md',
    lg: 'backdrop-blur-lg',
    xl: 'backdrop-blur-xl',
    '2xl': 'backdrop-blur-2xl',
    '3xl': 'backdrop-blur-3xl',
}

export type BlurSize = 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'

interface GradientBackgroundProps {
    className?: string
    backdropBlurAmount?: BlurSize
    disableGradient?: boolean
}

function GradientBackground({
    className = '',
    backdropBlurAmount = 'sm',
    disableGradient: forceDisable = false,
}: GradientBackgroundProps): React.JSX.Element {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [isEnabled, setIsEnabled] = useState(!forceDisable)
    const [isLowSpec, setIsLowSpec] = useState(false)
    const isMobile = useIsMobile()

    useEffect(() => {
        const lowSpec = isMobile
            ? false // if mobile, override and set to false
            : (typeof navigator !== 'undefined' &&
                  navigator.hardwareConcurrency &&
                  navigator.hardwareConcurrency <= 2) ||
              (typeof navigator !== 'undefined' && (navigator as any).connection?.saveData)

        console.log(navigator.hardwareConcurrency)
        setIsLowSpec(lowSpec)
    }, [isMobile])

    useEffect(() => {
        if (forceDisable) {
            setIsEnabled(false)
        }
    }, [forceDisable])

    useEffect(() => {
        if (!isEnabled) return

        const canvas = canvasRef.current!
        const gl = canvas.getContext('webgl')
        if (!gl) {
            console.error('WebGL not supported')
            setIsEnabled(false)
            return
        }

        const createShader = (type: number, source: string) => {
            const shader = gl.createShader(type)!
            gl.shaderSource(shader, source)
            gl.compileShader(shader)
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader))
                gl.deleteShader(shader)
                return null
            }
            return shader
        }

        const vertexShaderObj = createShader(gl.VERTEX_SHADER, vertexShaderSource)
        const fragmentShader = isLowSpec ? fragmentShaderLowSpec : fragmentShaderHighSpec
        const fragmentShaderObj = createShader(gl.FRAGMENT_SHADER, fragmentShader)

        const program = gl.createProgram()!
        gl.attachShader(program, vertexShaderObj!)
        gl.attachShader(program, fragmentShaderObj!)
        gl.linkProgram(program)

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(program))
            return
        }

        gl.useProgram(program)

        const positionAttributeLocation = gl.getAttribLocation(program, 'a_position')
        const iResolutionLocation = gl.getUniformLocation(program, 'iResolution')
        const iTimeLocation = gl.getUniformLocation(program, 'iTime')

        const positionBuffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
        const positions = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW)

        gl.enableVertexAttribArray(positionAttributeLocation)
        gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0)

        let startTime = Date.now()
        let animationFrameId: number

        const render = () => {
            const width = canvas.clientWidth
            const height = canvas.clientHeight
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width
                canvas.height = height
                gl.viewport(0, 0, width, height)
            }

            const currentTime = (Date.now() - startTime) / 1000
            gl.uniform2f(iResolutionLocation, width, height)
            gl.uniform1f(iTimeLocation, currentTime)

            gl.drawArrays(gl.TRIANGLES, 0, 6)
            animationFrameId = requestAnimationFrame(render)
        }

        render()

        return () => {
            cancelAnimationFrame(animationFrameId)
        }
    }, [isEnabled, isLowSpec])

    const finalBlurClass = blurClassMap[backdropBlurAmount as BlurSize] || blurClassMap['sm']

    return (
        <div className={`w-full max-w-screen h-full overflow-hidden bg-black ${className}`}>
            {isEnabled && (
                <>
                    <canvas
                        ref={canvasRef}
                        className="absolute inset-0 w-full max-w-screen h-full overflow-hidden"
                        style={{ display: 'block' }}
                    />
                    <div className={`absolute inset-0 ${finalBlurClass}`} />
                </>
            )}
        </div>
    )
}

export default GradientBackground
