import { Elysia, t } from "elysia";

import { email } from "@/app/api/[[...slugs]]/email";
import { notify } from "@/app/api/[[...slugs]]/notify";

const app = new Elysia({ prefix: "/api" })
  .get("/", "Hello Nextjs")
  .post("/", ({ body }) => body, {
    body: t.Object({
      name: t.String(),
    }),
  })
  .use(email)
  .use(notify);

export type App = typeof app;

export const GET = app.fetch;
export const POST = app.fetch;
