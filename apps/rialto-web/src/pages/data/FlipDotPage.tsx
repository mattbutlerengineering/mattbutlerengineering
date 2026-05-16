import { useState, useMemo } from "react";
import {
  Button,
  Card,
  FlipDot,
  Input,
  Slider,
  Stack,
  Text,
  Toggle,
  textToMatrix,
  createEmptyMatrix,
  useFlipDotAnimation,
} from "@mattbutlerengineering/rialto";
import type { StaggerDirection } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

// ── Pixel art: heart icon (7x7) ──────────────

const HEART: boolean[][] = [
  [false, true, false, false, false, true, false],
  [true, true, true, false, true, true, true],
  [true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true],
  [false, true, true, true, true, true, false],
  [false, false, true, true, true, false, false],
  [false, false, false, true, false, false, false],
];

// ── Props table data ─────────────────────────

const PROPS = [
  { name: "matrix", type: "boolean[][]", description: "2D grid \u2014 true = on (bright), false = off (dark)" },
  { name: "cols", type: "number", description: "Override column count. Pads/truncates matrix to fit." },
  { name: "rows", type: "number", description: "Override row count. Pads/truncates matrix to fit." },
  { name: "dotSize", type: "number", default: "8", description: "Dot diameter in pixels" },
  { name: "dotGap", type: "number", default: "3", description: "Gap between dots in pixels" },
  { name: "enableSound", type: "boolean", default: "false", description: "Enable mechanical click sound via Web Audio API" },
  { name: "soundVolume", type: "number", default: "0.3", description: "Sound volume (0\u20131)" },
  { name: "staggerDelay", type: "number", default: "8", description: "Base delay between dots in ms" },
  { name: "staggerJitter", type: "number", default: "0.4", description: "Random jitter factor (0\u20131)" },
  { name: "staggerDirection", type: '"left-to-right" | "top-to-bottom" | "center-out" | "random"', default: '"left-to-right"', description: "Direction of the flip cascade" },
];

// ── Static text demo ─────────────────────────

const MESSAGES = ["HELLO", "RIALTO", "FLIP DOT", "12:45"];

function StaticTextDemo() {
  const [msgIndex, setMsgIndex] = useState(0);
  const message = MESSAGES[msgIndex]!;
  const matrix = useMemo(() => textToMatrix(message, { rows: 7 }), [message]);

  return (
    <Stack gap="md">
      <FlipDot matrix={matrix} dotSize={6} dotGap={2} aria-label={message} />
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setMsgIndex((i) => (i + 1) % MESSAGES.length)}
      >
        Next message
      </Button>
    </Stack>
  );
}

// ── Configurable grid demo ───────────────────

function ConfigurableDemo() {
  const [dotSize, setDotSize] = useState(8);
  const [dotGap, setDotGap] = useState(3);
  const matrix = useMemo(() => textToMatrix("HI", { rows: 7 }), []);

  return (
    <Stack gap="md">
      <FlipDot matrix={matrix} dotSize={dotSize} dotGap={dotGap} aria-label="HI" />
      <Stack gap="sm">
        <Text variant="label" color="secondary">
          Dot size: {dotSize}px
        </Text>
        <Slider min={4} max={16} value={dotSize} onChange={setDotSize} />
        <Text variant="label" color="secondary">
          Dot gap: {dotGap}px
        </Text>
        <Slider min={1} max={8} value={dotGap} onChange={setDotGap} />
      </Stack>
    </Stack>
  );
}

// ── Scrolling marquee demo ───────────────────

function ScrollDemo() {
  const [text, setText] = useState("WELCOME TO RIALTO DESIGN SYSTEM");
  const { matrix, start, isPlaying } = useFlipDotAnimation({
    text,
    rows: 7,
    cols: 40,
    mode: "scroll-left",
    speed: 80,
    loop: true,
  });

  return (
    <Stack gap="md">
      <FlipDot matrix={matrix} cols={40} rows={7} dotSize={5} dotGap={2} aria-label={text} />
      <div style={{ display: "flex", gap: "var(--rialto-space-sm)", alignItems: "center" }}>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Scrolling text..."
          style={{ flex: 1 }}
        />
        <Button variant="secondary" size="sm" onClick={start} disabled={isPlaying}>
          Restart
        </Button>
      </div>
    </Stack>
  );
}

// ── Typewriter demo ──────────────────────────

function TypewriterDemo() {
  const { matrix, reset, start, isPlaying } = useFlipDotAnimation({
    text: "ARRIVALS",
    rows: 7,
    cols: 46,
    mode: "typewriter",
    speed: 60,
    loop: false,
  });

  return (
    <Stack gap="md">
      <FlipDot matrix={matrix} cols={46} rows={7} dotSize={5} dotGap={2} aria-label="ARRIVALS" />
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          reset();
          // Small delay so reset clears before restart
          setTimeout(start, 50);
        }}
        disabled={isPlaying}
      >
        Replay
      </Button>
    </Stack>
  );
}

// ── Sound demo ───────────────────────────────

function SoundDemo() {
  const [enableSound, setEnableSound] = useState(false);
  const [msgIndex, setMsgIndex] = useState(0);
  const messages = ["GATE A12", "DELAYED", "ON TIME"];
  const message = messages[msgIndex]!;
  const matrix = useMemo(() => textToMatrix(message, { rows: 7 }), [message]);

  return (
    <Stack gap="md">
      <FlipDot
        matrix={matrix}
        dotSize={6}
        dotGap={2}
        enableSound={enableSound}
        soundVolume={0.3}
        aria-label={message}
      />
      <div style={{ display: "flex", gap: "var(--rialto-space-md)", alignItems: "center" }}>
        <Toggle label="Sound" checked={enableSound} onCheckedChange={setEnableSound} />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setMsgIndex((i) => (i + 1) % messages.length)}
        >
          Change status
        </Button>
      </div>
    </Stack>
  );
}

// ── Stagger directions demo ──────────────────

const DIRECTIONS: StaggerDirection[] = [
  "left-to-right",
  "top-to-bottom",
  "center-out",
  "random",
];

function StaggerDemo() {
  const [key, setKey] = useState(0);
  const matrix = useMemo(() => textToMatrix("AB", { rows: 7 }), []);

  return (
    <Stack gap="md">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: "var(--rialto-space-lg)",
        }}
      >
        {DIRECTIONS.map((dir) => (
          <Stack key={dir} gap="xs" style={{ alignItems: "center" }}>
            <FlipDot
              key={`${dir}-${key}`}
              matrix={matrix}
              dotSize={5}
              dotGap={2}
              staggerDirection={dir}
              staggerDelay={12}
              aria-label={`AB with ${dir} stagger`}
            />
            <Text variant="caption" color="tertiary">
              {dir}
            </Text>
          </Stack>
        ))}
      </div>
      <Button variant="secondary" size="sm" onClick={() => setKey((k) => k + 1)}>
        Replay cascade
      </Button>
    </Stack>
  );
}

// ── Pixel art demo ───────────────────────────

function PixelArtDemo() {
  const [show, setShow] = useState(true);
  const emptyHeart = useMemo(() => createEmptyMatrix(7, 7), []);

  return (
    <Stack gap="md">
      <FlipDot
        matrix={show ? HEART : emptyHeart}
        dotSize={10}
        dotGap={3}
        staggerDirection="center-out"
        staggerDelay={15}
        aria-label="Heart icon"
      />
      <Button variant="secondary" size="sm" onClick={() => setShow((s) => !s)}>
        {show ? "Clear" : "Show"} heart
      </Button>
    </Stack>
  );
}

// ── Page ─────────────────────────────────────

export function FlipDotPage() {
  return (
    <ComponentPageLayout
      name="Flip Dot"
      description="Electromechanical flip-dot display with spring-physics animation, configurable grid, and optional sound."
    >
      <Section title="Static Text">
        <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
          <StaticTextDemo />
        </Card>
      </Section>

      <Section title="Configurable Grid">
        <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
          <ConfigurableDemo />
        </Card>
      </Section>

      <Section title="Scrolling Marquee">
        <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
          <ScrollDemo />
        </Card>
      </Section>

      <Section title="Typewriter">
        <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
          <TypewriterDemo />
        </Card>
      </Section>

      <Section title="Sound">
        <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
          <SoundDemo />
        </Card>
      </Section>

      <Section title="Pixel Art">
        <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
          <PixelArtDemo />
        </Card>
      </Section>

      <Section title="Stagger Directions">
        <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
          <StaggerDemo />
        </Card>
      </Section>

      <Section title="Props">
        <PropsTable props={PROPS} />
      </Section>
    </ComponentPageLayout>
  );
}

FlipDotPage.displayName = "FlipDotPage";
