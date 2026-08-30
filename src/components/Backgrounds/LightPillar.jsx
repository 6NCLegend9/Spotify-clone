"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import useMediaQuery from "@/hooks/useMediaQuery";

const QUALITY_SETTINGS = {
  low: {
    iterations: 24,
    waveIterations: 1,
    pixelRatio: 0.5,
    precision: "mediump",
    stepMultiplier: 1.5,
    fps: 30,
  },
  medium: {
    iterations: 40,
    waveIterations: 2,
    pixelRatio: 0.65,
    precision: "mediump",
    stepMultiplier: 1.2,
    fps: 45,
  },
  high: {
    iterations: 80,
    waveIterations: 4,
    pixelRatio: 2,
    precision: "highp",
    stepMultiplier: 1,
    fps: 60,
  },
};

const VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

export default function LightPillar({
  topColor = "#00e6e6",
  bottomColor = "#156d7a",
  intensity = 0.7,
  rotationSpeed = 0.16,
  glowAmount = 0.004,
  pillarWidth = 2.8,
  pillarHeight = 0.45,
  noiseIntensity = 0.22,
  pillarRotation = 12,
  quality = "medium",
  className = "",
}) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const materialRef = useRef(null);
  const frameRef = useRef(null);
  const [webGLSupported, setWebGLSupported] = useState(true);
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!context) setWebGLSupported(false);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !webGLSupported) return undefined;

    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const isLowEnd =
      isMobile ||
      (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
    let effectiveQuality = quality;
    if (isMobile) effectiveQuality = "low";
    else if (isLowEnd && quality === "high") effectiveQuality = "medium";
    const settings =
      QUALITY_SETTINGS[effectiveQuality] || QUALITY_SETTINGS.medium;

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const parseColor = (hex) => {
      const color = new THREE.Color(hex);
      return new THREE.Vector3(color.r, color.g, color.b);
    };

    const fragmentShader = `
      precision ${settings.precision} float;

      uniform float uTime;
      uniform vec2 uResolution;
      uniform vec3 uTopColor;
      uniform vec3 uBottomColor;
      uniform float uIntensity;
      uniform float uGlowAmount;
      uniform float uPillarWidth;
      uniform float uPillarHeight;
      uniform float uNoiseIntensity;
      uniform float uRotCos;
      uniform float uRotSin;
      uniform float uPillarRotCos;
      uniform float uPillarRotSin;
      uniform float uWaveSin;
      uniform float uWaveCos;
      varying vec2 vUv;

      const float STEP_MULT = ${settings.stepMultiplier.toFixed(1)};
      const int MAX_ITER = ${settings.iterations};
      const int WAVE_ITER = ${settings.waveIterations};

      void main() {
        vec2 uv = (vUv * 2.0 - 1.0) *
          vec2(uResolution.x / uResolution.y, 1.0);
        uv = vec2(
          uPillarRotCos * uv.x - uPillarRotSin * uv.y,
          uPillarRotSin * uv.x + uPillarRotCos * uv.y
        );

        vec3 rayOrigin = vec3(0.0, 0.0, -10.0);
        vec3 rayDirection = normalize(vec3(uv, 1.0));
        vec3 color = vec3(0.0);
        float travel = 0.1;

        for (int i = 0; i < MAX_ITER; i++) {
          vec3 point = rayOrigin + rayDirection * travel;
          point.xz = vec2(
            uRotCos * point.x - uRotSin * point.z,
            uRotSin * point.x + uRotCos * point.z
          );

          vec3 wave = point;
          wave.y = point.y * uPillarHeight + uTime;
          float frequency = 1.0;
          float amplitude = 1.0;

          for (int j = 0; j < WAVE_ITER; j++) {
            wave.xz = vec2(
              uWaveCos * wave.x - uWaveSin * wave.z,
              uWaveSin * wave.x + uWaveCos * wave.z
            );
            wave += cos(
              wave.zxy * frequency - uTime * float(j) * 2.0
            ) * amplitude;
            frequency *= 2.0;
            amplitude *= 0.5;
          }

          float distanceField = length(cos(wave.xz)) - 0.2;
          float radialBound = length(point.xz) - uPillarWidth;
          float smoothing = 4.0;
          float blend = max(
            smoothing - abs(distanceField - radialBound),
            0.0
          );
          distanceField =
            max(distanceField, radialBound) +
            blend * blend * 0.0625 / smoothing;
          distanceField = abs(distanceField) * 0.15 + 0.01;

          float gradient = clamp((15.0 - point.y) / 30.0, 0.0, 1.0);
          color += mix(uBottomColor, uTopColor, gradient) / distanceField;
          travel += distanceField * STEP_MULT;
          if (travel > 50.0) break;
        }

        float normalizedWidth = uPillarWidth / 3.0;
        color = tanh(color * uGlowAmount / normalizedWidth);
        color -= fract(
          sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) *
          43758.5453
        ) / 15.0 * uNoiseIntensity;

        vec3 result = clamp(color * uIntensity, 0.0, 1.0);
        gl_FragColor = vec4(result, 1.0);
      }
    `;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        powerPreference:
          effectiveQuality === "high" ? "high-performance" : "low-power",
        precision: settings.precision,
        stencil: false,
        depth: false,
      });
    } catch (error) {
      setWebGLSupported(false);
      return undefined;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(
      Math.min(settings.pixelRatio, window.devicePixelRatio || 1),
    );
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.className = "light-pillar-canvas";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const rotationRadians = (pillarRotation * Math.PI) / 180;
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(width, height) },
        uTopColor: { value: parseColor(topColor) },
        uBottomColor: { value: parseColor(bottomColor) },
        uIntensity: { value: intensity },
        uGlowAmount: { value: glowAmount },
        uPillarWidth: { value: pillarWidth },
        uPillarHeight: { value: pillarHeight },
        uNoiseIntensity: { value: noiseIntensity },
        uRotCos: { value: 1 },
        uRotSin: { value: 0 },
        uPillarRotCos: { value: Math.cos(rotationRadians) },
        uPillarRotSin: { value: Math.sin(rotationRadians) },
        uWaveSin: { value: Math.sin(0.4) },
        uWaveCos: { value: Math.cos(0.4) },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    materialRef.current = material;

    const geometry = new THREE.PlaneGeometry(2, 2);
    scene.add(new THREE.Mesh(geometry, material));

    let elapsed = 0;
    let lastFrame = performance.now();
    const frameInterval = 1000 / settings.fps;
    const render = (now) => {
      if (!rendererRef.current || !materialRef.current) return;
      const delta = now - lastFrame;
      if (delta >= frameInterval) {
        elapsed += 0.016 * rotationSpeed;
        material.uniforms.uTime.value = elapsed;
        material.uniforms.uRotCos.value = Math.cos(elapsed * 0.3);
        material.uniforms.uRotSin.value = Math.sin(elapsed * 0.3);
        renderer.render(scene, camera);
        lastFrame = now - (delta % frameInterval);
      }
      frameRef.current = window.requestAnimationFrame(render);
    };

    const stopAnimation = () => {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
    const startAnimation = () => {
      if (reduceMotion || document.hidden || frameRef.current) return;
      lastFrame = performance.now();
      frameRef.current = window.requestAnimationFrame(render);
    };
    const handleVisibility = () => {
      if (document.hidden) stopAnimation();
      else startAnimation();
    };

    renderer.render(scene, camera);
    startAnimation();
    document.addEventListener("visibilitychange", handleVisibility);

    let resizeTimer = null;
    const resize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (!rendererRef.current || !containerRef.current) return;
        const nextWidth = Math.max(1, containerRef.current.clientWidth);
        const nextHeight = Math.max(1, containerRef.current.clientHeight);
        rendererRef.current.setSize(nextWidth, nextHeight);
        material.uniforms.uResolution.value.set(nextWidth, nextHeight);
        rendererRef.current.render(scene, camera);
      }, 120);
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(resize);
    resizeObserver?.observe(container);
    window.addEventListener("resize", resize, { passive: true });

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("resize", resize);
      resizeObserver?.disconnect();
      window.clearTimeout(resizeTimer);
      stopAnimation();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      materialRef.current = null;
    };
  }, [
    bottomColor,
    glowAmount,
    intensity,
    noiseIntensity,
    pillarHeight,
    pillarRotation,
    pillarWidth,
    quality,
    reduceMotion,
    rotationSpeed,
    topColor,
    webGLSupported,
  ]);

  return (
    <div
      ref={containerRef}
      className={`light-pillar-container ${className}`}
      aria-hidden="true"
    >
      {!webGLSupported && <div className="light-pillar-fallback" />}
    </div>
  );
}
