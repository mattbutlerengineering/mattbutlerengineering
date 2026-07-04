import { pulumiJson } from "../command-builder.js";

export async function pulumiStackOutputs(run = pulumiJson): Promise<string> {
  return run(["stack", "output", "--json"]);
}
