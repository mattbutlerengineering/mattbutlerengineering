import { useCallback, useEffect } from "react";
import { useAuth } from "@mbe/auth/react";
import { useToast } from "@mattbutlerengineering/rialto";
import type { CommandItem } from "@mattbutlerengineering/rialto";
import type { Spec } from "@json-render/react";
import { useTheme } from "../contexts/ThemeContext.js";
import { downloadJson } from "../utils/downloadJson.js";
import { usePlaygroundSession } from "../pages/usePlaygroundSession.js";
import type { PlaygroundSession } from "../pages/usePlaygroundSession.js";

/**
 * Everything the playground view needs from the workbench, in one place.
 * PlaygroundPage stays a thin view over this: the session object plus the
 * shell-level callbacks it threads into AppShell and PlaygroundBody.
 */
export interface UsePlaygroundResult {
  session: PlaygroundSession;
  /** Flip the color theme (shell action + command palette). */
  toggleTheme: () => void;
  /** Reset the session, then sign the user out (shell + palette). */
  onSignOut: () => void;
  /** Reset the session back to the empty state (logo click). */
  onLogoClick: () => void;
  /** Open the template gallery (shell "Templates" button). */
  onTemplatesOpen: () => void;
}

/**
 * Owns the gen playground's workbench behaviour: the generation session, the
 * completion/error toasts, the global keyboard shortcuts, and the shell-level
 * callbacks. Concentrating this here keeps PlaygroundPage a declarative view
 * and makes the choreography testable without rendering the page tree.
 *
 * Command-palette items depend on shell panel controls that are only available
 * inside AppShell, so their construction lives in the pure
 * {@link buildPlaygroundCommandItems} builder (below) which PlaygroundBody
 * feeds with the session-derived state returned here plus its panel controls.
 */
export function usePlayground(): UsePlaygroundResult {
  const { signOut } = useAuth();
  const { toast } = useToast();
  const { toggleTheme } = useTheme();

  const session = usePlaygroundSession({
    onGenerationComplete: () =>
      toast({ title: "Generation complete", variant: "success", duration: 3000 }),
  });
  const { reset, error, toggleGallery, toggleShortcuts, openGallery } = session;

  const onSignOut = useCallback(() => {
    reset();
    void signOut();
  }, [reset, signOut]);

  const onLogoClick = useCallback(() => {
    reset();
  }, [reset]);

  const onTemplatesOpen = useCallback(() => {
    openGallery();
  }, [openGallery]);

  // Show error toast when generation fails
  useEffect(() => {
    if (error) {
      toast({
        title: "Generation failed",
        description: error.message,
        variant: "error",
        duration: 5000,
      });
    }
  }, [error, toast]);

  // Keyboard shortcut: Cmd+T / Ctrl+T to open template gallery
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "t") {
        e.preventDefault();
        toggleGallery();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [toggleGallery]);

  // Keyboard shortcut: "?" to open shortcuts help (only when no input is focused)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "?") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      toggleShortcuts();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [toggleShortcuts]);

  return { session, toggleTheme, onSignOut, onLogoClick, onTemplatesOpen };
}

/**
 * Inputs for {@link buildPlaygroundCommandItems}: the session-derived state and
 * verbs the workbench exposes, plus the shell panel controls that only exist
 * inside AppShell. Kept as an explicit flat contract so the command palette can
 * be unit-tested as a pure function, without a DOM or the shell context.
 */
export interface PlaygroundCommandDeps {
  isStreaming: boolean;
  displaySpec: Spec | null;
  reset: () => void;
  toggleFullscreen: () => void;
  stop: () => void;
  openGallery: () => void;
  openShortcuts: () => void;
  copy: (text: string) => Promise<boolean> | void;
  toggleTheme: () => void;
  onSignOut: () => void;
  closePalette: () => void;
  toggleHistory: () => void;
  toggleInspector: () => void;
}

/**
 * Build the command-palette items for the playground. Pure: given the current
 * session-derived state and the shell panel controls, it returns the item
 * array (each action closes the palette first, then runs its verb). Streaming
 * adds a "Stop Generation" item; an on-screen spec adds the export items.
 */
export function buildPlaygroundCommandItems({
  isStreaming,
  displaySpec,
  reset,
  toggleFullscreen,
  stop,
  openGallery,
  openShortcuts,
  copy,
  toggleTheme,
  onSignOut,
  closePalette,
  toggleHistory,
  toggleInspector,
}: PlaygroundCommandDeps): CommandItem[] {
  return [
    {
      id: "new-generation",
      label: "New Generation",
      group: "Actions",
      shortcut: ["⌘", "N"],
      onSelect: () => {
        closePalette();
        reset();
      },
    },
    {
      id: "toggle-fullscreen",
      label: "Toggle Fullscreen",
      group: "Actions",
      shortcut: ["⌘", "F"],
      onSelect: () => {
        closePalette();
        toggleFullscreen();
      },
    },
    ...(isStreaming
      ? [
          {
            id: "stop-generation",
            label: "Stop Generation",
            group: "Actions",
            shortcut: ["Esc"],
            onSelect: () => {
              closePalette();
              stop();
            },
          },
        ]
      : []),
    {
      id: "open-templates",
      label: "Browse Templates",
      group: "Actions",
      shortcut: ["⌘", "T"],
      onSelect: () => {
        closePalette();
        openGallery();
      },
    },
    ...(displaySpec
      ? [
          {
            id: "export-spec",
            label: "Download Spec as JSON",
            group: "Export",
            onSelect: () => {
              closePalette();
              downloadJson(displaySpec);
            },
          },
          {
            id: "copy-spec-json",
            label: "Copy Spec JSON",
            group: "Export",
            onSelect: () => {
              closePalette();
              void copy(JSON.stringify(displaySpec, null, 2));
            },
          },
        ]
      : []),
    {
      id: "toggle-history",
      label: "Toggle History Panel",
      group: "Panels",
      shortcut: ["⌘", "1"],
      onSelect: () => {
        closePalette();
        toggleHistory();
      },
    },
    {
      id: "toggle-inspector",
      label: "Toggle JSON Inspector",
      group: "Panels",
      shortcut: ["⌘", "2"],
      onSelect: () => {
        closePalette();
        toggleInspector();
      },
    },
    {
      id: "keyboard-shortcuts",
      label: "Keyboard Shortcuts",
      group: "Settings",
      shortcut: ["?"],
      onSelect: () => {
        closePalette();
        openShortcuts();
      },
    },
    {
      id: "toggle-theme",
      label: "Toggle Theme",
      group: "Settings",
      onSelect: () => {
        closePalette();
        toggleTheme();
      },
    },
    {
      id: "sign-out",
      label: "Sign Out",
      group: "Settings",
      onSelect: () => {
        closePalette();
        onSignOut();
      },
    },
  ];
}
