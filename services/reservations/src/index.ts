// OTel SDK must initialize before any other imports — it monkey-patches
// Node's HTTP stack during registration. startServiceServer uses dynamic
// imports internally to guarantee correct ordering.
import { startServiceServer } from "@mbe/database";

const PORT = parseInt(process.env.PORT ?? "3004", 10);

await startServiceServer({
  serviceName: "reservations-api",
  port: PORT,
  buildApp: () => import("./app.js").then((m) => m.buildApp()),
});
