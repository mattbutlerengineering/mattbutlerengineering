function defaultFilename(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `gen-spec-${ts}.json`;
}

export function downloadJson(data: unknown, filename?: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? defaultFilename();
  a.click();
  URL.revokeObjectURL(url);
}
