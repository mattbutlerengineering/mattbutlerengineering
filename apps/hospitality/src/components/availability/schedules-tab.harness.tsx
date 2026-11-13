import { useState } from "react";
import { ScheduleEditorDrawer } from "./ScheduleEditorDrawer.js";
import { SchedulesTab, type ScheduleEditorTarget, type SchedulesTabProps } from "./SchedulesTab.js";

export type SchedulesLayerProps = Omit<
  SchedulesTabProps,
  "onEditorChange" | "comparing" | "onComparingChange"
> & {
  /** Compare services starts open (the page's ⋯ menu opens it). */
  readonly comparing?: boolean;
  readonly onEditorChange?: (editor: ScheduleEditorTarget) => void;
};

/**
 * Test stand-in for the Availability page around the Schedules layer: it holds the editor target
 * and Compare, and renders the schedule editor the layer asks for.
 */
export function SchedulesLayer(props: SchedulesLayerProps) {
  const { comparing: startsComparing = false, onEditorChange, ...tab } = props;
  const [editor, setEditor] = useState<ScheduleEditorTarget | null>(null);
  const [comparing, setComparing] = useState(startsComparing);
  return (
    <>
      <SchedulesTab
        {...tab}
        onEditorChange={(next) => {
          onEditorChange?.(next);
          setEditor(next);
        }}
        comparing={comparing}
        onComparingChange={setComparing}
      />
      {editor && (
        <ScheduleEditorDrawer
          venueId={tab.venueId}
          state={tab.state}
          timezone={tab.timezone}
          today={tab.today}
          mode={editor.mode}
          {...(editor.sourceId ? { sourceScheduleId: editor.sourceId } : {})}
          {...(editor.seed ? { seed: editor.seed } : {})}
          onStale={tab.onStale}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}
