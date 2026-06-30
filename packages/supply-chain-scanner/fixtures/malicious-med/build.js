import { execSync } from "node:child_process";
export function build() {
  execSync("tsc --noEmit");
}
