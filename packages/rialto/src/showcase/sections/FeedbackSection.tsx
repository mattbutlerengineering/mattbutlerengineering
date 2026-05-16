import { useState } from "react";
import { Alert } from "../../components/Alert/Alert";
import { Banner } from "../../components/Banner/Banner";
import { Progress } from "../../components/Progress/Progress";
import { Meter } from "../../components/Meter/Meter";
import { Skeleton } from "../../components/Skeleton/Skeleton";
import { Steps } from "../../components/Steps/Steps";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { Button } from "../../components/Button/Button";
import { Text } from "../../components/Text/Text";
import { Inbox } from "lucide-react";
import css from "../showcase.module.css";

const STEP_ITEMS = [
  { label: "Account" },
  { label: "Profile" },
  { label: "Review" },
  { label: "Complete" },
];

export function FeedbackSection() {
  const [step, setStep] = useState(1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--rialto-space-xl)" }}>
      {/* Alerts */}
      <div>
        <Text variant="caption" color="secondary" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>
          Alerts
        </Text>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--rialto-space-sm)" }}>
          <Alert variant="info" title="Info">This is an informational alert.</Alert>
          <Alert variant="success" title="Success">Your changes have been saved.</Alert>
          <Alert variant="warning" title="Warning">This action cannot be undone.</Alert>
          <Alert variant="error" title="Error">Failed to save changes. Please try again.</Alert>
        </div>
      </div>

      {/* Banner */}
      <div>
        <Text variant="caption" color="secondary" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>
          Banner
        </Text>
        <Banner variant="info">System maintenance scheduled for tonight at 11 PM.</Banner>
      </div>

      {/* Progress */}
      <div className={css.gridWide}>
        <div>
          <Text variant="caption" color="secondary" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>
            Progress
          </Text>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--rialto-space-sm)" }}>
            <Progress value={25} label="Uploading..." />
            <Progress value={65} label="Processing..." />
            <Progress value={100} label="Complete" />
          </div>
        </div>
        <div>
          <Text variant="caption" color="secondary" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>
            Meter
          </Text>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--rialto-space-sm)" }}>
            <Meter value={30} max={100} label="Storage used" />
            <Meter value={75} max={100} label="API quota" />
            <Meter value={95} max={100} label="Disk space" />
          </div>
        </div>
      </div>

      {/* Skeleton */}
      <div>
        <Text variant="caption" color="secondary" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>
          Skeleton loading
        </Text>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--rialto-space-sm)", maxWidth: 400 }}>
          <Skeleton width="60%" height={24} />
          <Skeleton width="100%" height={16} />
          <Skeleton width="80%" height={16} />
          <div style={{ display: "flex", gap: "var(--rialto-space-sm)" }}>
            <Skeleton width={40} height={40} variant="circular" />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--rialto-space-xs)" }}>
              <Skeleton width="50%" height={14} />
              <Skeleton width="30%" height={14} />
            </div>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div>
        <Text variant="caption" color="secondary" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>
          Steps
        </Text>
        <Steps steps={STEP_ITEMS} activeStep={step} />
        <div className={css.row} style={{ marginBlockStart: "var(--rialto-space-sm)" }}>
          <Button size="sm" variant="secondary" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
            Previous
          </Button>
          <Button size="sm" variant="primary" onClick={() => setStep(Math.min(3, step + 1))} disabled={step === 3}>
            Next
          </Button>
        </div>
      </div>

      {/* Empty State */}
      <div>
        <Text variant="caption" color="secondary" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>
          Empty State
        </Text>
        <EmptyState
          icon={<Inbox size={48} />}
          title="No messages"
          description="You're all caught up. New messages will appear here."
          action={<Button variant="primary" size="sm">Compose</Button>}
        />
      </div>
    </div>
  );
}
