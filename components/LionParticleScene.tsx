"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  LION_CHILDREN_PER_ANCHOR,
  LION_PARTICLE_BASE64,
} from "../src/data/lionPayload";

type LionData = {
  pointPositions: Float32Array;
  pointColors: Float32Array;
  pointEnergy: Float32Array;
  pointSize: Float32Array;
  pointRegion: Float32Array;
  pointOrder: Float32Array;
  pointSeed: Float32Array;
  linePositions: Float32Array;
  lineColors: Float32Array;
  lineEnergy: Float32Array;
  lineOrder: Float32Array;
  lineSeed: Float32Array;
  pointCount: number;
};

const POINT_VERTEX_SHADER = /* glsl */ `
  precision highp float;

  attribute vec3 aColor;
  attribute float aEnergy;
  attribute float aSize;
  attribute float aRegion;
  attribute float aOrder;
  attribute vec2 aSeed;

  uniform float uTime;
  uniform float uFormation;
  uniform float uWind;
  uniform float uVisibility;
  uniform float uMotion;
  uniform float uPixelRatio;
  uniform vec2 uPointer;

  varying vec3 vColor;
  varying float vEnergy;
  varying float vOpacity;

  float ease(float x) {
    x = clamp(x, 0.0, 1.0);
    return x * x * (3.0 - 2.0 * x);
  }

  void main() {
    float localFormation = ease((uFormation - aOrder) / max(0.05, 1.0 - aOrder));
    float theta = aSeed.x * 6.28318530718 + aRegion * 0.39;
    float radial = 2.4 + aSeed.y * 4.8 + aRegion * 0.16;

    vec3 scattered = position + vec3(
      cos(theta) * radial,
      (aSeed.y - 0.42) * 5.4 + 0.9,
      sin(theta * 1.37) * (1.1 + aSeed.x * 1.4)
    );

    float breathe = sin(uTime * 0.72 + aSeed.x * 11.0 + position.y * 0.9);
    float fiber = sin(uTime * 1.14 + position.x * 2.4 + aSeed.y * 8.0);
    vec3 livingMotion = vec3(
      breathe * 0.010,
      fiber * 0.012,
      breathe * 0.018
    ) * uMotion * (0.45 + (1.0 - aEnergy) * 0.65);

    float depthFactor = clamp(position.z + 0.55, 0.0, 1.2);
    vec3 parallax = vec3(
      uPointer.x * (0.020 + depthFactor * 0.030),
      -uPointer.y * (0.015 + depthFactor * 0.026),
      0.0
    );

    vec3 windDirection = normalize(vec3(1.0, 0.16 + aSeed.y * 0.28, (aSeed.x - 0.5) * 0.44));
    vec3 wind = windDirection * uWind * (0.7 + aSeed.x * 2.8) * (0.45 + aRegion * 0.12);
    wind.y += sin(uTime * 2.1 + aSeed.y * 17.0) * uWind * 0.15;

    vec3 finalPosition = mix(scattered, position, localFormation);
    finalPosition += livingMotion * localFormation;
    finalPosition += parallax * localFormation;
    finalPosition += wind * localFormation;

    vec4 mvPosition = modelViewMatrix * vec4(finalPosition, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float perspective = 7.0 / max(2.0, -mvPosition.z);
    float px = (1.45 + aSize * 2.55 + aEnergy * 1.65) * uPixelRatio * perspective;
    gl_PointSize = clamp(px, 1.1, 8.8);

    vColor = aColor;
    vEnergy = aEnergy;
    vOpacity = localFormation * uVisibility;
  }
`;

const POINT_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec3 vColor;
  varying float vEnergy;
  varying float vOpacity;

  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    if (d > 0.5) discard;

    float core = 1.0 - smoothstep(0.08, 0.34, d);
    float halo = 1.0 - smoothstep(0.15, 0.5, d);
    float alpha = (core * 0.78 + halo * 0.38) * vOpacity;
    alpha *= 0.52 + vEnergy * 0.72;

    vec3 color = vColor * (1.08 + vEnergy * 0.72);
    color += vec3(0.035, 0.075, 0.11) * halo;

    gl_FragColor = vec4(color * alpha, alpha);
  }
`;

const LINE_VERTEX_SHADER = /* glsl */ `
  precision highp float;

  attribute vec3 aColor;
  attribute float aEnergy;
  attribute float aOrder;
  attribute vec2 aSeed;

  uniform float uTime;
  uniform float uFormation;
  uniform float uWind;
  uniform float uLineReveal;
  uniform float uMotion;
  uniform vec2 uPointer;

  varying vec3 vColor;
  varying float vAlpha;

  float ease(float x) {
    x = clamp(x, 0.0, 1.0);
    return x * x * (3.0 - 2.0 * x);
  }

  void main() {
    float localFormation = ease((uFormation - aOrder) / max(0.08, 1.0 - aOrder));
    float theta = aSeed.x * 6.28318530718;
    vec3 scattered = position + vec3(
      cos(theta) * (1.7 + aSeed.y * 3.4),
      (aSeed.y - 0.4) * 3.8 + 0.7,
      sin(theta) * 1.25
    );

    vec3 p = mix(scattered, position, localFormation);
    p += vec3(
      sin(uTime * 0.75 + aSeed.x * 9.0) * 0.006,
      cos(uTime * 0.92 + aSeed.y * 8.0) * 0.007,
      0.0
    ) * uMotion * localFormation;

    p += vec3(uPointer.x, -uPointer.y, 0.0) * 0.018 * localFormation;
    p += normalize(vec3(1.0, 0.2, aSeed.x - 0.5)) * uWind * (0.42 + aSeed.y * 1.4) * localFormation;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    vColor = aColor;
    vAlpha = localFormation * uLineReveal * (0.07 + aEnergy * 0.31);
  }
`;

const LINE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    gl_FragColor = vec4(vColor * 1.16, vAlpha);
  }
`;

function hash32(value: number) {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x ^= x >>> 16;
  return x >>> 0;
}

function unitHash(value: number) {
  return hash32(value) / 4294967295;
}

function decodeBase64(base64: string) {
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return bytes;
}

function decodeLionData(): LionData {
  const bytes = decodeBase64(LION_PARTICLE_BASE64);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const version = view.getUint16(8, true);
  const recordBytes = view.getUint16(10, true);
  const anchorCount = view.getUint32(12, true);
  const lineCount = view.getUint32(16, true);

  if (version !== 3 || recordBytes !== 10) {
    throw new Error("Unsupported lion particle payload.");
  }

  const anchorPositions = new Float32Array(anchorCount * 3);
  const anchorColors = new Float32Array(anchorCount * 3);
  const anchorEnergy = new Float32Array(anchorCount);
  const anchorRegion = new Float32Array(anchorCount);
  const anchorOrder = new Float32Array(anchorCount);

  let offset = 20;
  for (let i = 0; i < anchorCount; i += 1) {
    const x = view.getInt16(offset, true) / 8192;
    const y = view.getInt16(offset + 2, true) / 8192;
    const z = view.getInt16(offset + 4, true) / 32767;
    const rgb565 = view.getUint16(offset + 6, true);
    const meta = view.getUint16(offset + 8, true);

    const r = ((rgb565 >> 11) & 31) / 31;
    const g = ((rgb565 >> 5) & 63) / 63;
    const b = (rgb565 & 31) / 31;
    const energy = (meta & 63) / 63;
    const region = (meta >> 6) & 7;
    const order = ((meta >> 9) & 127) / 127;

    const p = i * 3;
    anchorPositions[p] = x;
    anchorPositions[p + 1] = y;
    anchorPositions[p + 2] = z;
    anchorColors[p] = r;
    anchorColors[p + 1] = g;
    anchorColors[p + 2] = b;
    anchorEnergy[i] = energy;
    anchorRegion[i] = region;
    anchorOrder[i] = order;

    offset += recordBytes;
  }

  const children = LION_CHILDREN_PER_ANCHOR;
  const pointCount = anchorCount * children;
  const pointPositions = new Float32Array(pointCount * 3);
  const pointColors = new Float32Array(pointCount * 3);
  const pointEnergy = new Float32Array(pointCount);
  const pointSize = new Float32Array(pointCount);
  const pointRegion = new Float32Array(pointCount);
  const pointOrder = new Float32Array(pointCount);
  const pointSeed = new Float32Array(pointCount * 2);

  for (let anchor = 0; anchor < anchorCount; anchor += 1) {
    const ap = anchor * 3;
    const ax = anchorPositions[ap];
    const ay = anchorPositions[ap + 1];
    const az = anchorPositions[ap + 2];
    const ar = anchorColors[ap];
    const ag = anchorColors[ap + 1];
    const ab = anchorColors[ap + 2];
    const energy = anchorEnergy[anchor];
    const region = anchorRegion[anchor];
    const order = anchorOrder[anchor];

    for (let child = 0; child < children; child += 1) {
      const index = anchor * children + child;
      const p = index * 3;
      const s = index * 2;
      const seedA = unitHash(anchor * 198491317 + child * 6542989 + 17);
      const seedB = unitHash(anchor * 376813 + child * 11731 + 91);

      let dx = 0;
      let dy = 0;
      let dz = 0;
      if (child !== 0) {
        const angle = seedA * Math.PI * 2;
        const detailScale = region >= 2 ? 0.62 : 1;
        const radius = (0.010 + seedB * 0.036) * detailScale * (0.78 + (1 - energy) * 0.34);
        dx = Math.cos(angle) * radius;
        dy = Math.sin(angle) * radius;
        dz = (unitHash(index * 92821 + 7) - 0.5) * radius * 0.85;
      }

      const colorVariation = 0.86 + seedB * 0.24;
      pointPositions[p] = ax + dx;
      pointPositions[p + 1] = ay + dy;
      pointPositions[p + 2] = az + dz;
      pointColors[p] = Math.min(1, ar * colorVariation + energy * 0.02);
      pointColors[p + 1] = Math.min(1, ag * colorVariation + energy * 0.035);
      pointColors[p + 2] = Math.min(1, ab * colorVariation + energy * 0.055);
      pointEnergy[index] = Math.min(1, energy * (child === 0 ? 1.08 : 0.82 + seedA * 0.22));
      pointSize[index] = child === 0 ? 0.8 + energy * 0.2 : 0.28 + seedB * 0.55 + energy * 0.22;
      pointRegion[index] = region;
      pointOrder[index] = Math.min(0.97, order + (child === 0 ? 0 : seedA * 0.035));
      pointSeed[s] = seedA;
      pointSeed[s + 1] = seedB;
    }
  }

  const linePositions = new Float32Array(lineCount * 2 * 3);
  const lineColors = new Float32Array(lineCount * 2 * 3);
  const lineEnergy = new Float32Array(lineCount * 2);
  const lineOrder = new Float32Array(lineCount * 2);
  const lineSeed = new Float32Array(lineCount * 2 * 2);

  for (let line = 0; line < lineCount; line += 1) {
    const a = view.getUint16(offset, true);
    const b = view.getUint16(offset + 2, true);
    offset += 4;

    const endpoints = [a, b];
    for (let e = 0; e < 2; e += 1) {
      const anchor = endpoints[e];
      const sourceP = anchor * 3;
      const vertex = line * 2 + e;
      const targetP = vertex * 3;
      const targetS = vertex * 2;

      linePositions[targetP] = anchorPositions[sourceP];
      linePositions[targetP + 1] = anchorPositions[sourceP + 1];
      linePositions[targetP + 2] = anchorPositions[sourceP + 2];
      lineColors[targetP] = anchorColors[sourceP];
      lineColors[targetP + 1] = anchorColors[sourceP + 1];
      lineColors[targetP + 2] = anchorColors[sourceP + 2];
      lineEnergy[vertex] = anchorEnergy[anchor];
      lineOrder[vertex] = Math.min(0.92, anchorOrder[anchor] + 0.04);
      lineSeed[targetS] = unitHash(anchor * 2654435761 + e * 13);
      lineSeed[targetS + 1] = unitHash(anchor * 2246822519 + e * 71);
    }
  }

  return {
    pointPositions,
    pointColors,
    pointEnergy,
    pointSize,
    pointRegion,
    pointOrder,
    pointSeed,
    linePositions,
    lineColors,
    lineEnergy,
    lineOrder,
    lineSeed,
    pointCount,
  };
}

function smoothstep01(value: number) {
  const x = THREE.MathUtils.clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
}

export default function LionParticleScene() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      setFailed(true);
      return;
    }

    if (!renderer.capabilities.isWebGL2 && renderer.capabilities.maxVertexTextures === 0) {
      renderer.dispose();
      setFailed(true);
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const data = decodeLionData();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 40);
    camera.position.set(0, 0.02, 7.25);

    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    mount.appendChild(renderer.domElement);
    renderer.domElement.className = "particleCanvas";
    renderer.domElement.setAttribute("aria-hidden", "true");

    const group = new THREE.Group();
    group.rotation.y = -0.035;
    group.rotation.x = -0.01;
    scene.add(group);

    const pointer = new THREE.Vector2();
    const uniforms = {
      uTime: { value: 0 },
      uFormation: { value: reducedMotion ? 1 : 0 },
      uWind: { value: 0 },
      uVisibility: { value: reducedMotion ? 1 : 0 },
      uMotion: { value: reducedMotion ? 0 : 1 },
      uPixelRatio: { value: 1 },
      uPointer: { value: pointer },
      uLineReveal: { value: reducedMotion ? 1 : 0 },
    };

    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute("position", new THREE.BufferAttribute(data.pointPositions, 3));
    pointGeometry.setAttribute("aColor", new THREE.BufferAttribute(data.pointColors, 3));
    pointGeometry.setAttribute("aEnergy", new THREE.BufferAttribute(data.pointEnergy, 1));
    pointGeometry.setAttribute("aSize", new THREE.BufferAttribute(data.pointSize, 1));
    pointGeometry.setAttribute("aRegion", new THREE.BufferAttribute(data.pointRegion, 1));
    pointGeometry.setAttribute("aOrder", new THREE.BufferAttribute(data.pointOrder, 1));
    pointGeometry.setAttribute("aSeed", new THREE.BufferAttribute(data.pointSeed, 2));
    pointGeometry.computeBoundingSphere();

    const pointMaterial = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: POINT_VERTEX_SHADER,
      fragmentShader: POINT_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(pointGeometry, pointMaterial);
    points.frustumCulled = false;
    group.add(points);

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(data.linePositions, 3));
    lineGeometry.setAttribute("aColor", new THREE.BufferAttribute(data.lineColors, 3));
    lineGeometry.setAttribute("aEnergy", new THREE.BufferAttribute(data.lineEnergy, 1));
    lineGeometry.setAttribute("aOrder", new THREE.BufferAttribute(data.lineOrder, 1));
    lineGeometry.setAttribute("aSeed", new THREE.BufferAttribute(data.lineSeed, 2));

    const lineMaterial = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: LINE_VERTEX_SHADER,
      fragmentShader: LINE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });

    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    lines.frustumCulled = false;
    group.add(lines);

    let qualityStage = 0;
    let currentDpr = 1;
    let width = 1;
    let height = 1;

    const resize = () => {
      width = Math.max(1, mount.clientWidth);
      height = Math.max(1, mount.clientHeight);
      const aspect = width / height;

      camera.aspect = aspect;
      camera.updateProjectionMatrix();

      const wantedDpr = Math.min(window.devicePixelRatio || 1, width < 720 ? 1.55 : 2);
      currentDpr = qualityStage > 0 ? Math.min(wantedDpr, 1.25) : wantedDpr;
      renderer.setPixelRatio(currentDpr);
      renderer.setSize(width, height, false);
      uniforms.uPixelRatio.value = currentDpr;

      let scale = 1.04;
      if (aspect < 0.62) scale = 0.58;
      else if (aspect < 0.82) scale = 0.72;
      else if (aspect < 1.05) scale = 0.88;

      group.scale.setScalar(scale);
      group.position.set(aspect < 0.72 ? 0.02 : -0.04, aspect < 0.72 ? 0.05 : -0.01, 0);
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);

    const targetPointer = new THREE.Vector2();
    const onPointerMove = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      targetPointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
      targetPointer.y = ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;
    };
    const onPointerLeave = () => targetPointer.set(0, 0);
    mount.addEventListener("pointermove", onPointerMove, { passive: true });
    mount.addEventListener("pointerleave", onPointerLeave, { passive: true });

    let manuallyPaused = false;
    let elapsed = reducedMotion ? 20 : 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        manuallyPaused = !manuallyPaused;
      } else if (event.key.toLowerCase() === "r") {
        elapsed = reducedMotion ? 20 : 0;
        manuallyPaused = false;
      }
    };
    mount.addEventListener("keydown", onKeyDown);

    let lastTime = performance.now();
    const onVisibility = () => {
      lastTime = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let raf = 0;
    let emaMs = 16.7;
    let sampleFrames = 0;

    const applyQualityStage = (next: number) => {
      if (next <= qualityStage) return;
      qualityStage = next;

      if (qualityStage >= 1) {
        currentDpr = Math.min(window.devicePixelRatio || 1, 1.25);
        renderer.setPixelRatio(currentDpr);
        renderer.setSize(width, height, false);
        uniforms.uPixelRatio.value = currentDpr;
        lines.visible = false;
      }
      if (qualityStage >= 2) {
        pointGeometry.setDrawRange(0, Math.floor(data.pointCount * 0.78));
      }
      if (qualityStage >= 3) {
        pointGeometry.setDrawRange(0, Math.floor(data.pointCount * 0.58));
      }
    };

    const render = (now: number) => {
      const rawDt = Math.max(0, now - lastTime);
      lastTime = now;
      const dt = Math.min(rawDt, 50) / 1000;

      if (!document.hidden && !manuallyPaused && !reducedMotion) elapsed += dt;

      const formation = reducedMotion ? 1 : smoothstep01((elapsed - 0.32) / 5.2);
      const visibility = reducedMotion ? 1 : smoothstep01(elapsed / 0.78);
      const lineReveal = reducedMotion ? 1 : smoothstep01((formation - 0.46) / 0.42);

      let wind = 0;
      if (!reducedMotion && elapsed > 12.0 && elapsed < 16.8) {
        const phase = (elapsed - 12.0) / 4.8;
        wind = Math.sin(Math.PI * phase) * 0.14;
      }

      pointer.lerp(targetPointer, reducedMotion ? 1 : 0.045);
      uniforms.uTime.value = elapsed;
      uniforms.uFormation.value = formation;
      uniforms.uVisibility.value = visibility;
      uniforms.uLineReveal.value = lineReveal;
      uniforms.uWind.value = wind;
      uniforms.uMotion.value = reducedMotion ? 0 : smoothstep01((formation - 0.65) / 0.35);

      if (!reducedMotion && formation > 0.95) {
        group.rotation.y = -0.035 + pointer.x * 0.014;
        group.rotation.x = -0.01 - pointer.y * 0.009;
      }

      renderer.render(scene, camera);

      if (!document.hidden && rawDt < 100) {
        emaMs = emaMs * 0.95 + rawDt * 0.05;
        sampleFrames += 1;
        if (sampleFrames > 180 && sampleFrames % 120 === 0) {
          if (emaMs > 32) applyQualityStage(3);
          else if (emaMs > 27) applyQualityStage(2);
          else if (emaMs > 22) applyQualityStage(1);
        }
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      mount.removeEventListener("pointermove", onPointerMove);
      mount.removeEventListener("pointerleave", onPointerLeave);
      mount.removeEventListener("keydown", onKeyDown);
      resizeObserver.disconnect();
      pointGeometry.dispose();
      lineGeometry.dispose();
      pointMaterial.dispose();
      lineMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="particleStage"
      role="img"
      aria-label="A cinematic lion formed from luminous GPU particles. Press Space to pause or R to replay the formation."
      tabIndex={0}
    >
      {failed ? <div className="webglFallback" aria-hidden="true" /> : null}
    </div>
  );
}
