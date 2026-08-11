/**
 * One-time OneDrive (personal Microsoft account) auth bootstrap.
 *
 * The intranet drives a *personal* OneDrive, which only supports the delegated
 * OAuth flow. Run this once, locally, to sign in as the drive owner
 * (chefsache@) and obtain a refresh token. The API then exchanges that token
 * for access tokens on its own.
 *
 *   MS_GRAPH_CLIENT_ID=... MS_GRAPH_CLIENT_SECRET=... bun run scripts/onedrive-auth.ts
 *
 * Prereqs (Azure app registration, "Personal Microsoft accounts only"):
 *   - Redirect URI (Web):  http://localhost:5555/callback
 *   - Delegated Graph perms: Files.ReadWrite.All, offline_access, User.Read
 *
 * On success it prints the refresh token — set it as ONEDRIVE_REFRESH_TOKEN on
 * the API. From then on the API rotates + persists it in Convex automatically.
 */

const PORT = 5555;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPE = "Files.ReadWrite.All offline_access User.Read";
const AUTHORITY = process.env.ONEDRIVE_AUTHORITY ?? "consumers";

const clientId = process.env.MS_GRAPH_CLIENT_ID;
const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    "Missing MS_GRAPH_CLIENT_ID / MS_GRAPH_CLIENT_SECRET.\n" +
      "Run:  MS_GRAPH_CLIENT_ID=... MS_GRAPH_CLIENT_SECRET=... bun run scripts/onedrive-auth.ts",
  );
  process.exit(1);
}

const authorizeUrl =
  `https://login.microsoftonline.com/${AUTHORITY}/oauth2/v2.0/authorize?` +
  new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    response_mode: "query",
    scope: SCOPE,
  }).toString();

async function exchangeCode(code: string): Promise<void> {
  const res = await fetch(`https://login.microsoftonline.com/${AUTHORITY}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      scope: SCOPE,
    }).toString(),
  });
  const json = (await res.json()) as {
    refresh_token?: string;
    error_description?: string;
  };
  if (!res.ok || !json.refresh_token) {
    throw new Error(json.error_description ?? `Token exchange failed (HTTP ${res.status})`);
  }
  console.log("\n✅ Success! Set this on the API environment:\n");
  console.log(`ONEDRIVE_REFRESH_TOKEN=${json.refresh_token}\n`);
  console.log(
    "The API will rotate + persist it in Convex from here on — you won't need to re-run this unless it's revoked.\n",
  );
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname !== "/callback") {
      return new Response("Waiting for the OAuth callback…", { status: 404 });
    }
    const error = url.searchParams.get("error_description");
    const code = url.searchParams.get("code");
    if (error) {
      console.error(`\n❌ Sign-in was denied or failed: ${error}`);
      queueMicrotask(() => process.exit(1));
      return new Response("Sign-in failed — check the terminal.", {
        status: 400,
      });
    }
    if (!code) return new Response("Missing authorization code", { status: 400 });
    try {
      await exchangeCode(code);
      queueMicrotask(() => process.exit(0));
      return new Response("OneDrive connected. You can close this tab and return to the terminal.");
    } catch (e) {
      console.error(`\n❌ ${e instanceof Error ? e.message : e}`);
      queueMicrotask(() => process.exit(1));
      return new Response("Token exchange failed — check the terminal.", {
        status: 500,
      });
    }
  },
});

console.log(`\nListening on ${REDIRECT_URI}`);
console.log("Open this URL, sign in as the OneDrive owner (chefsache@), and consent:\n");
console.log(authorizeUrl + "\n");

// Keep the process alive until the callback handler exits it.
void server;
