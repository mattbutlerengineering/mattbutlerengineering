import { use, useMemo, useState, createContext, type ReactNode } from "react";
import type { ComponentRegistry, ComponentRenderProps, Spec } from "@json-render/react";
import { planDialogControls } from "../lib/dialog-controls.js";
import type { DialogPlan } from "../lib/dialog-controls.js";

interface DialogApi {
  plan: DialogPlan;
  isOpen: (key: string) => boolean;
  open: (key: string) => void;
  close: (key: string) => void;
}

const DialogControlContext = createContext<DialogApi | null>(null);

const GEN_KEY = "genKey";

function genKeyOf(element: ComponentRenderProps["element"]): string | null {
  const key = (element as { [GEN_KEY]?: unknown })[GEN_KEY];
  return typeof key === "string" ? key : null;
}

export function DialogControlProvider({
  spec,
  children,
}: {
  spec: Spec | null;
  children: ReactNode;
}) {
  const plan = useMemo(() => planDialogControls(spec), [spec]);
  const [boundSpec, setBoundSpec] = useState(spec);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  if (boundSpec !== spec) {
    setBoundSpec(spec);
    setOverrides({});
  }

  const api = useMemo<DialogApi>(
    () => ({
      plan,
      isOpen(key) {
        if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key] ?? false;
        return plan.dialogs[key]?.initialOpen ?? false;
      },
      open(key) {
        setOverrides((prev) => ({ ...prev, [key]: true }));
      },
      close(key) {
        setOverrides((prev) => ({ ...prev, [key]: false }));
      },
    }),
    [plan, overrides]
  );

  return <DialogControlContext value={api}>{children}</DialogControlContext>;
}

/**
 * Dialog `open` follows the plan (closed until its button is pressed) and
 * Close / Esc / the ✕ — which only emit `"close"` — actually dismiss it.
 * Button presses run the planned open or close as well as `press`.
 */
export function createInteractiveRegistry(base: ComponentRegistry): ComponentRegistry {
  const next: ComponentRegistry = { ...base };
  const dialogView = base.Dialog;
  const buttonView = base.Button;

  if (dialogView) {
    const DialogView = dialogView;
    function DialogEntry(props: ComponentRenderProps) {
      const api = use(DialogControlContext);
      const key = genKeyOf(props.element);
      const managed = Boolean(api && key && api.plan.dialogs[key]);
      const current = props.element.props as { open?: unknown } | undefined;
      const open = managed && api && key ? api.isOpen(key) : current?.open === true;
      return (
        <DialogView
          {...props}
          element={{ ...props.element, props: { ...current, open } }}
          emit={(event: string) => {
            props.emit(event);
            if (event === "close" && api && key) api.close(key);
          }}
        />
      );
    }
    DialogEntry.displayName = "DialogEntry";
    next.Dialog = DialogEntry;
  }

  if (buttonView) {
    const ButtonView = buttonView;
    function ButtonEntry(props: ComponentRenderProps) {
      const api = use(DialogControlContext);
      const key = genKeyOf(props.element);
      const action = api && key ? api.plan.buttons[key] : undefined;
      return (
        <ButtonView
          {...props}
          emit={(event: string) => {
            props.emit(event);
            if (event !== "press" || !api || !action) return;
            if (action.kind === "open") api.open(action.dialogKey);
            else api.close(action.dialogKey);
          }}
        />
      );
    }
    ButtonEntry.displayName = "ButtonEntry";
    next.Button = ButtonEntry;
  }

  return next;
}
