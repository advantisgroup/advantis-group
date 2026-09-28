import { Elysia, t } from "elysia";

import { account } from "@/app/api/[[...slugs]]/account";
import { altcha } from "@/app/api/[[...slugs]]/altcha";
import { callback } from "@/app/api/[[...slugs]]/callback";
import { email } from "@/app/api/[[...slugs]]/email";
import { notify } from "@/app/api/[[...slugs]]/notify";
import { submissions } from "@/app/api/[[...slugs]]/submissions";
import { whitepaper } from "@/app/api/[[...slugs]]/whitepaper";

const app = new Elysia({ prefix: "/api" })
  .get("/", "Hello Nextjs")
  .post("/", ({ body }) => body, {
    body: t.Object({
      name: t.String(),
    }),
  })
  .use(account)
  .use(altcha)
  .use(callback)
  .use(email)
  .use(notify)
  .use(submissions)
  .use(whitepaper);

export type App = typeof app;

export const GET = app.fetch;
export const POST = app.fetch;
export const DELETE = app.fetch;
