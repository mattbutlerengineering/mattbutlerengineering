/**
 * Keep a DatePicker calendar under its field.
 *
 * placePopover flips to whichever side has more room. On a phone the month
 * grid is ~332px and the field sits under the page title, so the room above
 * wins and the grid covers the title. When the space under the field can
 * still show a month, shrink the sheet so the measured panel fits there and
 * the grid scrolls inside itself. When that space is too short, scroll the
 * page once so the full grid fits under the field. The flip stays only for a
 * field that is pinned to the bottom of the viewport.
 *
 * The fit runs from a child of the panel: useLayoutEffect fires deepest
 * first, so the sheet's scrollHeight is already capped before useLayerFloating
 * measures it.
 */

/** Same gap placePopover uses between a trigger and its panel. */
const POPOVER_ANCHOR_GAP = 8;

/**
 * Room under the field that is still worth using, in px. Below this the
 * calendar flips above instead of becoming a short scroller. 240px shows the
 * month header and about four weeks.
 */
const MIN_ROOM_BELOW = 240;

/** Sheet height under which the month header and a couple of weeks no longer fit. */
const MIN_SHEET = 160;

const EDGE_MARGIN = 8;

export function scrollDeltaToFitBelow(options: {
  anchorTop: number;
  anchorBottom: number;
  panelHeight: number;
  viewportHeight: number;
  scrollerTop: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  gap?: number;
  margin?: number;
}): number {
  const gap = options.gap ?? POPOVER_ANCHOR_GAP;
  const margin = options.margin ?? EDGE_MARGIN;
  if (options.panelHeight <= 0) return 0;
  const room = options.viewportHeight - options.anchorBottom - gap;
  if (options.panelHeight <= room) return 0;
  const deficit = options.panelHeight - room;
  const spare = options.anchorTop - options.scrollerTop - margin;
  const scrollRoom = options.scrollHeight - options.clientHeight - options.scrollTop;
  return Math.max(0, Math.min(deficit, spare, scrollRoom));
}

/**
 * Max height for the calendar sheet, or null to leave it at its natural size
 * (it already fits below, or the room is too small and the panel should flip).
 */
export function sheetMaxHeight(options: {
  panelScrollHeight: number;
  sheetOffsetHeight: number;
  anchorBottom: number;
  viewportHeight: number;
  gap?: number;
  minRoom?: number;
  minSheet?: number;
}): number | null {
  const gap = options.gap ?? POPOVER_ANCHOR_GAP;
  const minRoom = options.minRoom ?? MIN_ROOM_BELOW;
  const minSheet = options.minSheet ?? MIN_SHEET;
  const room = options.viewportHeight - options.anchorBottom - gap;
  if (options.panelScrollHeight <= room + 0.5) return null;
  if (room < minRoom) return null;
  const chrome = Math.max(0, options.panelScrollHeight - options.sheetOffsetHeight);
  const inner = Math.floor(room - chrome);
  if (inner < minSheet) return null;
  return inner;
}

function isVerticalScroller(node: HTMLElement): boolean {
  const { overflowY } = getComputedStyle(node);
  return (
    (overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1
  );
}

function anchorForPanel(panel: HTMLElement): HTMLElement | null {
  const trigger = document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(panel.id)}"]`);
  // The trigger sits in an inner presentation wrapper. Its parent is the
  // popover anchor useLayerFloating measures, including when the panel is
  // portaled out of that anchor.
  const nearest = trigger?.closest("[role='presentation']")?.parentElement;
  return nearest instanceof HTMLElement ? nearest : null;
}

function applyFit(sheet: HTMLElement, allowScroll: boolean): void {
  const panel = sheet.closest<HTMLElement>("[role='dialog']");
  if (!panel?.id) return;
  const anchor = anchorForPanel(panel);
  if (!anchor) return;

  sheet.style.maxHeight = "";
  sheet.style.overflowY = "";
  sheet.style.overscrollBehavior = "";

  const viewportHeight = document.documentElement.clientHeight;
  let anchorBottom = anchor.getBoundingClientRect().bottom;
  const needed = panel.scrollHeight;
  const room = viewportHeight - anchorBottom - POPOVER_ANCHOR_GAP;

  if (allowScroll && needed > room && room < MIN_ROOM_BELOW) {
    let node = anchor.parentElement;
    while (node) {
      if (isVerticalScroller(node)) {
        const rect = anchor.getBoundingClientRect();
        const delta = scrollDeltaToFitBelow({
          anchorTop: rect.top,
          anchorBottom: rect.bottom,
          panelHeight: needed,
          viewportHeight,
          scrollerTop: node.getBoundingClientRect().top,
          scrollTop: node.scrollTop,
          scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight,
        });
        if (delta >= 1) {
          node.scrollTop += delta;
          break;
        }
      }
      node = node.parentElement;
    }
    anchorBottom = anchor.getBoundingClientRect().bottom;
  }

  // scrollHeight ignores the panel border, so a cap that fills the room
  // exactly still paints the border past the viewport edge.
  const frame = Math.max(0, panel.offsetHeight - panel.clientHeight);
  const max = sheetMaxHeight({
    panelScrollHeight: panel.scrollHeight,
    sheetOffsetHeight: sheet.offsetHeight,
    anchorBottom,
    viewportHeight: viewportHeight - frame,
  });
  if (max == null) return;
  sheet.style.maxHeight = `${max}px`;
  sheet.style.overflowY = "auto";
  sheet.style.overscrollBehavior = "contain";
}

/** Fit once before the panel is placed, then again on resize. Page scrolls do not move the scroller again. */
export function bindCalendarFit(sheet: HTMLElement): () => void {
  const onScroll = (event: Event) => {
    const panel = sheet.closest("[role='dialog']");
    if (panel && event.target instanceof Node && panel.contains(event.target)) return;
    applyFit(sheet, false);
  };
  const onResize = () => applyFit(sheet, true);
  applyFit(sheet, true);
  window.addEventListener("resize", onResize);
  window.addEventListener("scroll", onScroll, true);
  return () => {
    window.removeEventListener("resize", onResize);
    window.removeEventListener("scroll", onScroll, true);
  };
}
