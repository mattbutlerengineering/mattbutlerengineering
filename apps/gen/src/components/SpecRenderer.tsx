import { JSONUIProvider, Renderer } from "@json-render/react";
import type { Spec } from "@json-render/react";
import type { ReactNode } from "react";
import { registry } from "@mbe/rialto-catalog";

export interface SpecProviderProps {
  children: ReactNode;
}

/** JSONUIProvider bound to the Rialto catalog registry. */
export function SpecProvider({ children }: SpecProviderProps) {
  return <JSONUIProvider registry={registry}>{children}</JSONUIProvider>;
}

export interface SpecRendererProps {
  spec: Spec | null;
  loading?: boolean;
}

/** json-render Renderer bound to the Rialto catalog registry. */
export function SpecRenderer({ spec, loading = false }: SpecRendererProps) {
  return <Renderer spec={spec} registry={registry} loading={loading} />;
}
