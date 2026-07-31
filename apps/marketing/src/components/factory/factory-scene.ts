import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Mesh,
  NormalBlending,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "three";
import {
  BACKDROP_FRAGMENT_SHADER,
  BACKDROP_VERTEX_SHADER,
  PARTICLE_FRAGMENT_SHADER,
  PARTICLE_VERTEX_SHADER,
} from "./factory-shaders.js";
import { readFactoryPalette, type FactoryPalette } from "./factory-palette.js";
import type { FactorySceneInputs } from "./pipeline-stages.js";

/** Retina is worth paying for; 3x displays are not. */
const MAX_DPR = 2;
/** Lane slots the agents gate fans work out into. */
const LANES = [-1, -0.66, -0.33, 0, 0.33, 0.66, 1] as const;

/**
 * Start the WebGL factory floor on `canvas` and return its teardown.
 *
 * Everything the loop owns — the GL context, geometries, materials, frames,
 * observers, listeners — is released by the returned function, so a component
 * that mounts and unmounts repeatedly never leaks a context.
 *
 * Degrades to a no-op when the browser cannot give a WebGL context (including
 * jsdom, where the surrounding DOM still renders every stage as text).
 */
export function startFactoryScene(
  canvas: HTMLCanvasElement,
  inputs: FactorySceneInputs
): () => void {
  // Probed with the attributes the renderer needs: a second `getContext` call
  // returns the context created by the first, ignoring its arguments.
  const context = canvas.getContext("webgl2", {
    alpha: true,
    antialias: true,
    depth: false,
    powerPreference: "high-performance",
  });
  return context ? runScene(canvas, context as WebGL2RenderingContext, inputs) : () => {};
}

function runScene(
  canvas: HTMLCanvasElement,
  context: WebGL2RenderingContext,
  inputs: FactorySceneInputs
): () => void {
  const renderer = new WebGLRenderer({ canvas, context, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  // Fixed design space: x ∈ [-1, 1], y ∈ [-0.5, 0.5], stretched to the canvas.
  const camera = new OrthographicCamera(-1, 1, 0.5, -0.5, -1, 1);

  const backdropGeometry = new PlaneGeometry(2, 1);
  const backdropMaterial = new ShaderMaterial({
    vertexShader: BACKDROP_VERTEX_SHADER,
    fragmentShader: BACKDROP_FRAGMENT_SHADER,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uUnitPerPx: { value: [2 / 1000, 1 / 300] },
      uLine: { value: [0, 0, 0] },
      uAccent: { value: [0, 0, 0] },
      uIsDark: { value: 0 },
    },
  });
  const backdrop = new Mesh(backdropGeometry, backdropMaterial);
  backdrop.frustumCulled = false;
  scene.add(backdrop);

  const particleGeometry = buildParticleGeometry(inputs.particleCount);
  const particleMaterial = new ShaderMaterial({
    vertexShader: PARTICLE_VERTEX_SHADER,
    fragmentShader: PARTICLE_FRAGMENT_SHADER,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uAgentShare: { value: inputs.agentShare },
      uPixelRatio: { value: 1 },
      uLine: { value: [0, 0, 0] },
      uAccent: { value: [0, 0, 0] },
      uPass: { value: [0, 0, 0] },
      uFail: { value: [0, 0, 0] },
      uIsDark: { value: 0 },
    },
  });
  const particles = new Points(particleGeometry, particleMaterial);
  particles.frustumCulled = false;
  scene.add(particles);

  const start = performance.now();
  let frameId = 0;
  let onScreen = true;
  let stopped = false;

  function applyPalette(palette: FactoryPalette): void {
    const isDark = palette.isDark ? 1 : 0;
    backdropMaterial.uniforms["uLine"]!.value = palette.line;
    backdropMaterial.uniforms["uAccent"]!.value = palette.accent;
    backdropMaterial.uniforms["uIsDark"]!.value = isDark;
    particleMaterial.uniforms["uLine"]!.value = palette.line;
    particleMaterial.uniforms["uAccent"]!.value = palette.accent;
    particleMaterial.uniforms["uPass"]!.value = palette.pass;
    particleMaterial.uniforms["uFail"]!.value = palette.fail;
    particleMaterial.uniforms["uIsDark"]!.value = isDark;
    // Light surfaces wash out under additive blending; dark ones come alive.
    particleMaterial.blending = palette.isDark ? AdditiveBlending : NormalBlending;
    particleMaterial.needsUpdate = true;
  }

  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    backdropMaterial.uniforms["uUnitPerPx"]!.value = [2 / (width * dpr), 1 / (height * dpr)];
    particleMaterial.uniforms["uPixelRatio"]!.value = dpr;
  }

  function tick(): void {
    frameId = requestAnimationFrame(tick);
    const elapsed = (performance.now() - start) / 1000;
    backdropMaterial.uniforms["uTime"]!.value = elapsed;
    particleMaterial.uniforms["uTime"]!.value = elapsed;
    renderer.render(scene, camera);
  }

  function play(): void {
    if (!frameId && !stopped) frameId = requestAnimationFrame(tick);
  }

  function pause(): void {
    if (!frameId) return;
    cancelAnimationFrame(frameId);
    frameId = 0;
  }

  /** Frames are only worth spending while the canvas is on screen and on top. */
  function syncPlayback(): void {
    if (onScreen && !document.hidden) play();
    else pause();
  }

  const intersection = new IntersectionObserver((entries) => {
    onScreen = entries.some((entry) => entry.isIntersecting);
    syncPlayback();
  });
  intersection.observe(canvas);

  const themeChange = new MutationObserver(() => applyPalette(readFactoryPalette(canvas)));
  themeChange.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", syncPlayback);

  applyPalette(readFactoryPalette(canvas));
  resize();
  play();

  return () => {
    if (stopped) return;
    stopped = true;
    pause();
    intersection.disconnect();
    themeChange.disconnect();
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", syncPlayback);
    backdropGeometry.dispose();
    backdropMaterial.dispose();
    particleGeometry.dispose();
    particleMaterial.dispose();
    renderer.forceContextLoss();
    renderer.dispose();
  };
}

/**
 * One buffer of seeds. Positions are computed on the GPU from these, so the
 * attribute data is written once at mount and never touched again.
 */
function buildParticleGeometry(count: number): BufferGeometry {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const lanes = new Float32Array(count);
  const speeds = new Float32Array(count);
  const rolls = new Float32Array(count);

  for (let index = 0; index < count; index++) {
    phases[index] = Math.random();
    lanes[index] = LANES[index % LANES.length]!;
    speeds[index] = 0.82 + Math.random() * 0.42;
    rolls[index] = Math.random();
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aPhase", new BufferAttribute(phases, 1));
  geometry.setAttribute("aLane", new BufferAttribute(lanes, 1));
  geometry.setAttribute("aSpeed", new BufferAttribute(speeds, 1));
  geometry.setAttribute("aRoll", new BufferAttribute(rolls, 1));
  return geometry;
}
