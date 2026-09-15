import type { ReactNode } from "react";
import { useState } from "react";
import { Badge, Button, Card, Stack, Text } from "@mattbutlerengineering/rialto";
import { CompositionNote, ExamplePageLayout } from "./ExamplePageLayout";
import styles from "./ReservationKanbanExamplePage.module.css";

/* ── Domain ──────────────────────────────────── */

export type ReservationStage = "pre-arrival" | "in-progress" | "checkout";

export interface KanbanCard {
  id: string;
  guest: string;
  room: string;
  date: string;
  party: number;
  stage: ReservationStage;
}

interface StageMeta {
  id: ReservationStage;
  label: string;
  badgeVariant: "neutral" | "accent" | "success";
}

/** Column order + display metadata — the single source of truth for stage sequencing. */
export const STAGES: StageMeta[] = [
  { id: "pre-arrival", label: "Pre-Arrival", badgeVariant: "neutral" },
  { id: "in-progress", label: "In Progress", badgeVariant: "accent" },
  { id: "checkout", label: "Checkout", badgeVariant: "success" },
];

/* ── Fixture data (no service calls) ─────────── */

export const KANBAN_CARDS: KanbanCard[] = [
  {
    id: "RES-2001",
    guest: "Elena Marchetti",
    room: "Suite 402",
    date: "Mar 23",
    party: 2,
    stage: "pre-arrival",
  },
  {
    id: "RES-2002",
    guest: "James Whitfield",
    room: "Deluxe 218",
    date: "Mar 24",
    party: 1,
    stage: "pre-arrival",
  },
  {
    id: "RES-2003",
    guest: "Amara Okonkwo",
    room: "Standard 115",
    date: "Mar 25",
    party: 3,
    stage: "pre-arrival",
  },
  {
    id: "RES-2004",
    guest: "Luca Ferreira",
    room: "Suite 510",
    date: "Mar 20",
    party: 2,
    stage: "in-progress",
  },
  {
    id: "RES-2005",
    guest: "Sophie Laurent",
    room: "Deluxe 307",
    date: "Mar 21",
    party: 4,
    stage: "in-progress",
  },
  {
    id: "RES-2006",
    guest: "Tariq Al-Rashid",
    room: "Standard 208",
    date: "Mar 19",
    party: 2,
    stage: "in-progress",
  },
  {
    id: "RES-2007",
    guest: "Mei Lin Chen",
    room: "Suite 401",
    date: "Mar 18",
    party: 2,
    stage: "checkout",
  },
  {
    id: "RES-2008",
    guest: "Oliver Brandt",
    room: "Deluxe 220",
    date: "Mar 17",
    party: 1,
    stage: "checkout",
  },
  {
    id: "RES-2009",
    guest: "Nadia Petrova",
    room: "Standard 118",
    date: "Mar 16",
    party: 2,
    stage: "checkout",
  },
];

/* ── Pure data transforms (exported for direct testing) ─────────── */

/** The stage that follows `stage`, or `null` when it is already the last column. */
export function nextStageId(stage: ReservationStage): ReservationStage | null {
  const index = STAGES.findIndex((s) => s.id === stage);
  return STAGES[index + 1]?.id ?? null;
}

/** Advance one card to the following stage; a card already in the last stage is unchanged. */
export function moveCardToNextStage(cards: KanbanCard[], id: string): KanbanCard[] {
  return cards.map((card) => {
    if (card.id !== id) return card;
    const next = nextStageId(card.stage);
    return next ? { ...card, stage: next } : card;
  });
}

/** Subset of cards currently sitting in `stage`, in fixture order. */
export function cardsByStage(cards: KanbanCard[], stage: ReservationStage): KanbanCard[] {
  return cards.filter((card) => card.stage === stage);
}

/* ── Source snippet + composition notes ──────── */

const SOURCE_JSX = `import { Card, Badge, Button, Stack, Text } from "@mattbutlerengineering/rialto";

// Local fixture — no service calls, no drag-and-drop dependency
const columnCards = cardsByStage(cards, stage.id);
const next = nextStageId(card.stage);

<Card>
  <Text variant="label">{card.guest}</Text>
  <Text variant="caption" color="secondary">{card.room} · {card.date}</Text>
  {next && (
    <Button size="sm" variant="ghost" onClick={() => setCards((prev) => moveCardToNextStage(prev, card.id))}>
      Move to next stage →
    </Button>
  )}
</Card>`;

const COMPOSITION_NOTES: ReactNode = (
  <>
    <CompositionNote>
      Three columns — Pre-Arrival, In-Progress, Checkout — are rendered from one fixture array
      filtered by <code>stage</code>. A card moves forward through the pipeline by reassigning its
      <code>stage</code> field, a pure transform that returns a new array rather than mutating rows.
    </CompositionNote>
    <CompositionNote>
      No drag-and-drop library is used. Rialto has no card-reorder primitive today, so each card
      exposes a click-based &ldquo;Move to next stage &rarr;&rdquo; action instead — the last column
      has no forward action, since checkout is the end of the lifecycle.
    </CompositionNote>
  </>
);

/* ── Card component ──────────────────────────── */

function KanbanCardItem({
  card,
  onAdvance,
}: {
  card: KanbanCard;
  onAdvance: (id: string) => void;
}) {
  const next = nextStageId(card.stage);
  return (
    <Card className={styles.card}>
      <Stack gap="xs">
        <Text variant="label">{card.guest}</Text>
        <Text variant="caption" color="secondary">
          {card.room} · {card.date}
        </Text>
        <Badge variant="neutral" size="sm">
          {card.party} {card.party === 1 ? "guest" : "guests"}
        </Badge>
        {next && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Move ${card.guest} to next stage`}
            onClick={() => onAdvance(card.id)}
          >
            Move to next stage →
          </Button>
        )}
      </Stack>
    </Card>
  );
}

/* ── Page component ──────────────────────────── */

export function ReservationKanbanExamplePage() {
  const [cards, setCards] = useState<KanbanCard[]>(KANBAN_CARDS);

  const handleAdvance = (id: string) => {
    setCards((prev) => moveCardToNextStage(prev, id));
  };

  return (
    <ExamplePageLayout
      name="Reservation Kanban"
      description="Workflow board tracking reservations across pre-arrival, in-progress, and checkout stages"
      sourceJsx={SOURCE_JSX}
      compositionNotes={COMPOSITION_NOTES}
    >
      <div className={styles.board}>
        {STAGES.map((stage) => {
          const columnCards = cardsByStage(cards, stage.id);
          return (
            <div key={stage.id} className={styles.column} aria-label={stage.label}>
              <div className={styles.columnHeader}>
                <Text variant="label">{stage.label}</Text>
                <Badge variant={stage.badgeVariant} size="sm">
                  {columnCards.length}
                </Badge>
              </div>
              <Stack gap="sm">
                {columnCards.map((card) => (
                  <KanbanCardItem key={card.id} card={card} onAdvance={handleAdvance} />
                ))}
              </Stack>
            </div>
          );
        })}
      </div>
    </ExamplePageLayout>
  );
}

ReservationKanbanExamplePage.displayName = "ReservationKanbanExamplePage";
