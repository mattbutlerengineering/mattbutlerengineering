import { Link } from "react-router";
import {
  Heading,
  Button,
  Text,
  Card,
  Stack,
  useScrollReveal,
  staggerReveal,
} from "@mattbutlerengineering/rialto";
import { motion } from "framer-motion";
import type { WeeklyResource } from "../data/weekly-intake.js";
import { formatDate } from "../utils/formatters.js";
import styles from "../pages/HomePage.module.css";

interface ReadingSectionProps {
  readonly items: readonly WeeklyResource[];
}

/**
 * "What I'm reading" — only when there is something recent to list. With no
 * items it renders nothing, so the page never shows an empty heading and a
 * button that leads to stale links.
 */
export function ReadingSection({ items }: ReadingSectionProps) {
  const { ref, controls } = useScrollReveal();

  if (items.length === 0) return null;

  return (
    <motion.div
      ref={ref}
      data-reveal="weekly"
      variants={staggerReveal.item}
      initial="hidden"
      animate={controls}
    >
      <Card variant="elevated" data-testid="weekly-cta" className={styles.invitationCard}>
        <Stack gap="md" align="center">
          <Heading level={2}>What I&apos;m reading</Heading>
          <ul className={styles.readingList}>
            {items.map((item) => (
              <li key={item.id}>
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  {item.title}
                </a>{" "}
                <Text as="span" variant="detail" color="tertiary">
                  <time dateTime={item.publishedAt}>{formatDate(item.publishedAt)}</time>
                </Text>
              </li>
            ))}
          </ul>
          <Link to="/weekly">
            <Button variant="primary" size="md">
              Browse the stack
            </Button>
          </Link>
        </Stack>
      </Card>
    </motion.div>
  );
}
