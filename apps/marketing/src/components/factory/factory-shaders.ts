/**
 * GLSL for the factory floor.
 *
 * The whole animation lives on the GPU: every frame the CPU writes one `uTime`
 * uniform and issues two draw calls, so the render loop can never produce a
 * long task no matter how many particles are on the line.
 *
 * Design space is fixed at x ∈ [-1, 1], y ∈ [-0.5, 0.5] and stretches to the
 * canvas, so the composition is identical at every viewport width. Stroke
 * widths are expressed in `uUnitPerPx` (design units per device pixel) to stay
 * crisp at any size and device pixel ratio.
 */

/** Shared constants and helpers, prepended to both fragment programs. */
const COMMON = /* glsl */ `
  const float PI = 3.14159265;
  /* Height of the conveyor rail in design space. */
  const float RAIL_Y = 0.26;
  /* How far the feedback arc dips below the rail. */
  const float ARC_DEPTH = 0.50;
  /* Leftmost gate, and the spacing that lands all six on a six-column grid. */
  const float GATE_0 = -0.8333333;
  const float GATE_STEP = 0.3333333;
  /* Seconds for the gold pulse to sweep the whole line. */
  const float PULSE_CYCLE = 7.0;

  float gateX(int index) {
    return GATE_0 + GATE_STEP * float(index);
  }

  /* Soft symmetric falloff — a line of half-width \`w\` centred on \`d = 0\`. */
  float stroke(float d, float w) {
    return exp(-abs(d) / w);
  }

  float bell(float d, float w) {
    return exp(-(d * d) / (w * w));
  }

  float pulseX(float time) {
    return mix(-1.08, 1.08, fract(time / PULSE_CYCLE));
  }
`;

/** Full-screen quad in design space; `position` arrives from `PlaneGeometry`. */
export const BACKDROP_VERTEX_SHADER = /* glsl */ `
  varying vec2 vPos;

  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The fixed machinery: rail, measuring ticks, six gate posts and their collars,
 * the gold pulse that sweeps them, the deploy burst, and the dashed feedback
 * arc looping back to intake.
 */
export const BACKDROP_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vPos;

  uniform float uTime;
  uniform vec2 uUnitPerPx;
  uniform vec3 uLine;
  uniform vec3 uAccent;
  uniform float uIsDark;

  ${COMMON}

  void main() {
    vec2 p = vPos;
    float dy = p.y - RAIL_Y;
    float edge = smoothstep(1.02, 0.9, abs(p.x));
    float wave = pulseX(uTime);

    /* Neutral structure and gold accent accumulate separately so gold can stay
       surgical: it is only ever the moving pulse and what it touches. */
    float ink = 0.0;
    float gold = 0.0;

    /* The rail: a crisp line over a wide, faint bloom. */
    ink += stroke(dy, uUnitPerPx.y * 1.4) * 1.0 * edge;
    ink += stroke(dy, 0.022) * 0.16 * edge;

    /* Machinist's rule beneath the rail. */
    float tickDistance = abs(fract(p.x * 30.0) - 0.5) / 30.0;
    float tickBand = smoothstep(0.020, 0.0, abs(dy + 0.017));
    ink += stroke(tickDistance, uUnitPerPx.x * 1.2) * tickBand * 0.34 * edge;

    /* Gate posts hang below the rail towards the labels; a collar marks each
       one on the rail itself. */
    float postWindow = smoothstep(0.10, 0.0, dy > 0.0 ? dy * 2.4 : -dy * 0.34);
    for (int i = 0; i < 6; i++) {
      float gx = gateX(i);
      float post = stroke(p.x - gx, uUnitPerPx.x * 1.5) * postWindow;
      float collar = stroke(p.x - gx, uUnitPerPx.x * 3.0) * stroke(dy, uUnitPerPx.y * 5.0);
      ink += post * 0.62 + collar * 0.5;
      gold += (post + collar * 1.4) * bell(wave - gx, 0.06) * 1.5;
    }

    /* The pulse itself, riding the rail. */
    gold += bell(p.x - wave, 0.055) * stroke(dy, uUnitPerPx.y * 3.0) * edge * 1.3;
    gold += bell(p.x - wave, 0.09) * stroke(dy, 0.014) * edge * 0.26;

    /* Deploy: a tight standing glow that flares as the pulse lands. */
    vec2 burst = (p - vec2(gateX(5), RAIL_Y)) / vec2(0.075, 0.055);
    gold += exp(-dot(burst, burst)) * (0.3 + 0.75 * bell(wave - gateX(5), 0.10));

    /* Feedback arc: deploy back round to issues, flowing right to left. */
    float u = clamp((p.x - GATE_0) / (gateX(5) - GATE_0), 0.0, 1.0);
    float arcY = RAIL_Y - ARC_DEPTH * sin(PI * u);
    float onArc = step(GATE_0 - 0.005, p.x) * step(p.x, gateX(5) + 0.005);
    float dash = 0.1 + 0.9 * pow(0.5 + 0.5 * sin(u * 150.0 + uTime * 5.0), 4.0);
    ink += stroke(p.y - arcY, uUnitPerPx.y * 1.3) * onArc * dash * 0.85;

    /* Dark surfaces need less ink to read; light ones need more to stop the
       structure dissolving into the page. */
    float inkAlpha = ink * mix(0.78, 0.46, uIsDark);
    float alpha = clamp(inkAlpha + gold, 0.0, 1.0);
    vec3 color = (uLine * inkAlpha + uAccent * gold) / max(inkAlpha + gold, 0.0001);

    gl_FragColor = vec4(color, alpha);
  }
`;

/**
 * One issue's whole journey, evaluated per particle per frame.
 *
 * Progress is a pure function of `uTime` and the particle's own seed, so there
 * is no per-frame CPU work and no state to keep in sync.
 */
export const PARTICLE_VERTEX_SHADER = /* glsl */ `
  attribute float aPhase;
  attribute float aLane;
  attribute float aSpeed;
  attribute float aRoll;

  uniform float uTime;
  uniform float uAgentShare;
  uniform float uPixelRatio;
  uniform vec3 uLine;
  uniform vec3 uAccent;
  uniform vec3 uPass;
  uniform vec3 uFail;
  uniform float uIsDark;

  varying vec3 vColor;
  varying float vAlpha;

  ${COMMON}

  /* Seconds for one issue to travel the whole line at nominal speed. */
  const float TRAVEL = 13.0;
  /* Share of work a review gate turns back. */
  const float REJECT_RATE = 0.09;
  /* How hard work queues at each gate before being released. */
  const float QUEUE_DEPTH = 0.026;

  void main() {
    float progress = fract(aPhase + uTime / TRAVEL * aSpeed);
    float lane = mix(-1.08, 1.08, progress);
    /* Work slows into every gate and accelerates out of it, so it visibly
       queues where the pipeline actually makes a decision. */
    float x = lane - QUEUE_DEPTH * sin(2.0 * PI * (lane - GATE_0) / GATE_STEP);

    float agents = gateX(1);
    float tdd = gateX(2);
    float review = gateX(3);
    float merge = gateX(4);
    float deploy = gateX(5);

    /* Lanes open at the agents gate — parallel worktrees — and converge again
       as green work funnels into auto-merge. */
    float fan =
      smoothstep(agents - 0.16, agents + 0.04, x) *
      (1.0 - smoothstep(merge - 0.14, merge + 0.04, x));
    float y = RAIL_Y + aLane * 0.105 * fan;
    y += sin(x * 7.0 + aPhase * 6.2831853) * 0.003;

    /* Decorrelated from the agent draw — gates turn back agent and human work
       alike. */
    float rejected = step(1.0 - REJECT_RATE, fract(aRoll * 7.3 + aPhase));
    float turnedBack = rejected * smoothstep(review - 0.02, review + 0.03, x);
    y -= turnedBack * (x - review + 0.02) * 1.3;

    float agentAuthored = step(aRoll, uAgentShare);

    /* Raw, untested work is neutral; the TDD gate turns it red, then green. */
    vec3 color = mix(uLine, mix(uLine, uAccent, 0.3), agentAuthored);
    float red = smoothstep(tdd - 0.15, tdd - 0.03, x) * (1.0 - smoothstep(tdd, tdd + 0.045, x));
    float green = smoothstep(tdd + 0.01, tdd + 0.09, x);
    color = mix(color, uFail, red);
    color = mix(color, uPass, green * 0.92);
    color = mix(color, uFail, turnedBack);

    /* The only other gold on screen: the pulse washing over the stream. */
    float touched = bell(x - pulseX(uTime), 0.055);
    color = mix(color, uAccent, touched * 0.9);

    float size = mix(4.2, 5.8, agentAuthored);
    size *= 1.0 + touched * 1.4;
    size *= 1.0 + bell(x - deploy, 0.07) * 1.0;

    float alpha = smoothstep(-1.08, -0.9, x) * (1.0 - smoothstep(0.95, 1.08, x));
    alpha *= 1.0 - turnedBack;
    alpha *= mix(0.9, 0.92, uIsDark) * mix(0.72, 1.0, agentAuthored);

    vColor = color;
    vAlpha = alpha;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(x, y, 0.0, 1.0);
    gl_PointSize = size * uPixelRatio;
  }
`;

/**
 * A streak rather than a dot: the sprite is stretched along the direction of
 * travel and given a soft halo, so the stream reads as moving light.
 */
export const PARTICLE_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 offset = (gl_PointCoord - 0.5) * vec2(2.0, 4.0);
    float radius = min(length(offset), 1.0);
    float core = 1.0 - radius;
    float shape = core * core * 0.85 + pow(core, 0.45) * 0.3;
    gl_FragColor = vec4(vColor, shape * vAlpha);
  }
`;
