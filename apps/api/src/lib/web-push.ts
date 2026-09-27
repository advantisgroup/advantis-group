import webpush from "web-push";

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
}

let configured: boolean | null = null;

/** Push is optional: without VAPID keys in the environment nothing is sent.
 *  Generate a pair once with `bunx web-push generate-vapid-keys`; the public
 *  one also goes to the intranet as NEXT_PUBLIC_VAPID_PUBLIC_KEY. */
function configure(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:it@advantisgroup.de",
    publicKey,
    privateKey,
  );
  configured = true;
  return true;
}

/**
 * Sends one notification to each browser. Returns the endpoints the push
 * service says no longer exist (404/410), so the caller can forget them.
 */
export async function sendPush(
  subscriptions: PushSubscriptionKeys[],
  payload: PushPayload,
): Promise<{ sent: number; gone: string[] }> {
  if (!configure()) return { sent: 0, gone: [] };
  const body = JSON.stringify(payload);
  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    subscriptions.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60 * 24, urgency: "normal" },
        );
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.endpoint);
        else console.error(`[push] send failed (${status ?? "?"}) for one subscription`);
      }
    }),
  );
  return { sent, gone };
}
