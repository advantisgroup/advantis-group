import { defineSchema } from "convex/server";

import { marketingTables } from "./tables/marketing";
import { identityTables } from "./tables/identity";
import { securityTables } from "./tables/security";
import { itTicketsTables } from "./tables/itTickets";
import { commsTables } from "./tables/comms";
import { chatTables } from "./tables/chat";
import { performanceTables } from "./tables/performance";
import { activityTables } from "./tables/activity";
import { contentTables } from "./tables/content";
import { integrationsTables } from "./tables/integrations";
import { hrTables } from "./tables/hr";
import { aiTables } from "./tables/ai";
import { salesTables } from "./tables/sales";
import { timeTables } from "./tables/time";

// Validators live in lib/validators.ts; re-exported here so the many
// `from "./schema"` imports keep working.
export * from "./lib/validators";

export default defineSchema({
  ...marketingTables,
  ...identityTables,
  ...securityTables,
  ...itTicketsTables,
  ...commsTables,
  ...chatTables,
  ...performanceTables,
  ...activityTables,
  ...contentTables,
  ...integrationsTables,
  ...hrTables,
  ...aiTables,
  ...salesTables,
  ...timeTables,
});
