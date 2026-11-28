import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { ParseKeys } from "i18next";
import { Heading, Text } from "@mattbutlerengineering/rialto";
import { TERM_POSITIONS, TERM_RELATIONS } from "../../i18n/terminology.js";
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  diagramSize,
  edgeBetween,
  labelLines,
  nodeCenter,
} from "./diagram-geometry.js";
import styles from "./TerminologyDiagram.module.css";

const LINE_HEIGHT = 14;
const NODE_IDS = [...new Set(TERM_RELATIONS.flatMap(({ from, to }) => [from, to]))];
const SIZE = diagramSize(NODE_IDS.map((id) => TERM_POSITIONS[id]!));

function useTerm() {
  const { t } = useTranslation();
  return (id: string) => t(`terminology.terms.${id}` as ParseKeys);
}

/**
 * How the terms relate, drawn as boxes and arrows, with the same relationships as a list for
 * screen readers (and anyone who prefers words). The SVG scrolls sideways below its natural
 * width instead of shrinking its labels.
 */
export function TerminologyDiagram() {
  const { t } = useTranslation();
  const term = useTerm();
  const listId = useId();
  const titleId = useId();
  const arrowId = useId();

  const sentence = (relation: (typeof TERM_RELATIONS)[number]) =>
    t(relation.optional ? "terminology.diagram.relationOptional" : "terminology.diagram.relation", {
      from: term(relation.from),
      label: t(`terminology.relations.${relation.label}` as ParseKeys),
      to: term(relation.to),
    });

  return (
    <div className={styles.diagram}>
      <Text variant="body" color="primary" className={styles.lead}>
        {t("terminology.diagram.lead")}
      </Text>
      <div
        className={styles.scroller}
        role="group"
        aria-label={t("terminology.diagram.title")}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the diagram scrolls sideways on narrow screens, so it must be keyboard reachable (axe: scrollable-region-focusable)
        tabIndex={0}
      >
        <svg
          className={styles.svg}
          viewBox={`0 0 ${SIZE.width} ${SIZE.height}`}
          width={SIZE.width}
          height={SIZE.height}
          role="img"
          aria-labelledby={titleId}
          aria-describedby={listId}
        >
          <title id={titleId}>{t("terminology.diagram.label")}</title>
          <defs>
            <marker
              id={arrowId}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className={styles.arrowHead} />
            </marker>
          </defs>
          {TERM_RELATIONS.map((relation) => {
            const { start, end } = edgeBetween(
              TERM_POSITIONS[relation.from]!,
              TERM_POSITIONS[relation.to]!
            );
            return (
              <line
                key={`${relation.from}-${relation.label}-${relation.to}`}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                className={relation.optional ? styles.edgeOptional : styles.edge}
                markerEnd={`url(#${arrowId})`}
              />
            );
          })}
          {NODE_IDS.map((id) => {
            const center = nodeCenter(TERM_POSITIONS[id]!);
            const lines = labelLines(term(id));
            const firstBaseline = center.y - ((lines.length - 1) * LINE_HEIGHT) / 2;
            return (
              <g key={id} data-testid="diagram-node">
                <rect
                  x={center.x - NODE_WIDTH / 2}
                  y={center.y - NODE_HEIGHT / 2}
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={6}
                  className={styles.node}
                />
                <text
                  x={center.x}
                  y={firstBaseline}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={styles.label}
                >
                  {lines.map((line, index) => (
                    <tspan key={line} x={center.x} dy={index === 0 ? 0 : LINE_HEIGHT}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <Heading level={3}>{t("terminology.diagram.listLabel")}</Heading>
      <ul id={listId} className={styles.list}>
        {TERM_RELATIONS.map((relation) => (
          <li key={`${relation.from}-${relation.label}-${relation.to}`}>
            <Text variant="body" color="primary" className={styles.prose}>
              {sentence(relation)}
            </Text>
          </li>
        ))}
      </ul>
    </div>
  );
}

TerminologyDiagram.displayName = "TerminologyDiagram";
