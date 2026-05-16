import { useState } from "react";
import {
  Button,
  Card,
  DataList,
  Input,
  SplitScreenExit,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

function SignInDemo() {
  const [exiting, setExiting] = useState(false);
  const [completed, setCompleted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setExiting(true);
  }

  function reset() {
    setExiting(false);
    setCompleted(false);
  }

  if (completed) {
    return (
      <Stack gap="md" align="start">
        <Text variant="label">Welcome back.</Text>
        <Text variant="body" color="secondary">
          The sign-in page split and slid offscreen; the parent&apos;s
          onExitComplete fired to navigate you here.
        </Text>
        <Button variant="secondary" onClick={reset}>
          Try again
        </Button>
      </Stack>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        minHeight: "320px",
        border: "1px dashed var(--rialto-border)",
        borderRadius: "var(--rialto-radius-default)",
      }}
    >
      <SplitScreenExit
        active={exiting}
        announcement="Signing you in"
        onExitComplete={() => setCompleted(true)}
      >
        <Card variant="elevated" style={{ padding: "var(--rialto-space-xl)" }}>
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <Text variant="label">Sign in</Text>
              <Input label="Email" type="email" placeholder="you@example.com" />
              <Input label="Password" type="password" placeholder="••••••••" />
              <Button variant="primary" type="submit">
                Continue
              </Button>
            </Stack>
          </form>
        </Card>
      </SplitScreenExit>
    </div>
  );
}

export function SplitScreenExitPage() {
  return (
    <ComponentPageLayout
      name="Split Screen Exit"
      description="A dramatic page-exit transition where the wrapped content splits down the middle and slides offscreen in opposite directions. Intended for full-screen gating moments like sign-in flows — the parent sets active=true on success and navigates from onExitComplete."
    >
      {/* ── Live demo ─────────────────────────────────────────────── */}
      <Section title="Sign-in demo">
        <SignInDemo />
      </Section>

      {/* ── When to use ───────────────────────────────────────────── */}
      <Section title="When to use">
        <Stack gap="sm">
          <Text variant="body">
            One-shot, high-drama transitions between distinct phases of an app:
          </Text>
          <ul>
            <li>Sign-in → dashboard after successful authentication</li>
            <li>Character select / intro sequence → gameplay</li>
            <li>Paywall / upgrade gate → unlocked content</li>
          </ul>
          <Text variant="caption" color="secondary">
            Not for regular route changes — use Framer Motion layout animations
            or React Router transitions for those.
          </Text>
        </Stack>
      </Section>

      {/* ── Props ─────────────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            { name: "active", type: "boolean", description: "Set to true to trigger the exit animation." },
            { name: "onExitComplete", type: "() => void", description: "Fires once after both halves finish — use it to navigate." },
            { name: "announcement", type: "string", description: "Polite live-region text that plays during the transition." },
            { name: "children", type: "ReactNode", description: "Content to display and split on exit." },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Children render once when idle", value: "Full AT and keyboard fidelity while active is false" },
            { label: "Halves hidden from AT during exit", value: "aria-hidden prevents duplicate readings" },
            { label: "Live region announcement", value: "Polite aria-live covers the ~600ms blind window" },
            { label: "Reduced motion", value: "Animation collapses; onExitComplete fires on next tick so parents still receive the callback" },
            { label: "Pointer events frozen during exit", value: "pointer-events: none on the wrapper — no stale clicks mid-transition" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

SplitScreenExitPage.displayName = "SplitScreenExitPage";
