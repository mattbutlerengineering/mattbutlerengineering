import {
  Alert,
  Avatar,
  AvatarGroup,
  Badge,
  Banner,
  Card,
  DataList,
  Table,
  Tag,
  Text,
} from "@mattbutlerengineering/rialto";
import { Section } from "./Section";
import { tableColumns, tableData } from "./fixtures";
import styles from "./VisualTest.module.css";

/**
 * Display sections of the Visual Test Harness: Card, Alert, Banner, Badge,
 * Tag, Avatar, AvatarGroup, Table, DataList.
 */
export function DisplaySections() {
  return (
    <>
      {/* ── Card ───────────────────────────── */}
      <Section id="card-variants" title="Card — Variants">
        <div className={styles.card}>
          <Card title="Card Title" subtitle="With subtitle">
            <Text>Card body content goes here.</Text>
          </Card>
          <Card>
            <Text>Plain card without title.</Text>
          </Card>
        </div>
      </Section>

      {/* ── Alert ──────────────────────────── */}
      <Section id="alert-variants" title="Alert — Variants">
        <div className={styles.cardColumn}>
          <Alert variant="info">Informational message.</Alert>
          <Alert variant="success">Operation completed successfully.</Alert>
          <Alert variant="warning">Please review before proceeding.</Alert>
          <Alert variant="error">Something went wrong.</Alert>
        </div>
      </Section>

      {/* ── Banner ─────────────────────────── */}
      <Section id="banner-variants" title="Banner — Variants">
        <div className={styles.cardColumn}>
          <Banner variant="info">System maintenance scheduled for tonight.</Banner>
          <Banner variant="warning">Your trial expires in 3 days.</Banner>
          <Banner variant="error">Payment method declined.</Banner>
          <Banner variant="accent">New feature available!</Banner>
        </div>
      </Section>

      {/* ── Badge ──────────────────────────── */}
      <Section id="badge-variants" title="Badge — Variants">
        <div className={styles.card}>
          <Badge variant="neutral">Neutral</Badge>
          <Badge variant="accent">Accent</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="error">Error</Badge>
        </div>
      </Section>

      {/* ── Tag ────────────────────────────── */}
      <Section id="tag-variants" title="Tag — Variants">
        <div className={styles.card}>
          <Tag>Default</Tag>
          <Tag variant="accent">Accent</Tag>
          <Tag variant="success">Success</Tag>
          <Tag variant="error">Error</Tag>
          <Tag variant="accent" selected>
            Selected
          </Tag>
          <Tag dismissible onDismiss={() => {}}>
            Dismissible
          </Tag>
        </div>
      </Section>

      {/* ── Avatar ─────────────────────────── */}
      <Section id="avatar-variants" title="Avatar — Sizes & Status">
        <div className={styles.card}>
          <Avatar name="Alice Smith" size="sm" />
          <Avatar name="Bob Jones" size="md" status="online" />
          <Avatar name="Carol Wu" size="lg" status="busy" />
          <Avatar name="David Kim" size="xl" status="away" />
        </div>
      </Section>

      <Section id="avatargroup-default" title="AvatarGroup">
        <div className={styles.card}>
          <AvatarGroup
            avatars={[
              { name: "Alice" },
              { name: "Bob" },
              { name: "Carol" },
              { name: "David" },
              { name: "Eve" },
            ]}
            max={3}
          />
        </div>
      </Section>

      {/* ── Table ──────────────────────────── */}
      <Section id="table-default" title="Table — With Data">
        <div className={styles.cardColumn}>
          <Table columns={tableColumns} data={tableData} rowKey={(r) => r.id} striped />
        </div>
      </Section>

      <Section id="table-empty" title="Table — Empty">
        <div className={styles.cardColumn}>
          <Table
            columns={tableColumns}
            data={[]}
            rowKey={(r: { id: string }) => r.id}
            emptyMessage="No records found"
          />
        </div>
      </Section>

      {/* ── DataList ─────────────────────────── */}
      <Section id="datalist-default" title="DataList">
        <div className={styles.cardColumn}>
          <DataList
            items={[
              { label: "Name", value: "Max Verstappen" },
              { label: "Team", value: "Red Bull Racing" },
              { label: "Number", value: "1" },
              { label: "Nationality", value: "Dutch" },
            ]}
            striped
          />
        </div>
      </Section>
    </>
  );
}
