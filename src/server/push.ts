import "server-only";

import webpush from "web-push";
import { createAdminClient } from "@/server/supabase/admin";

type NoticeUrgency = "normal" | "important" | "urgent";

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushBroadcastResult = {
  configured: boolean;
  attempted: number;
  delivered: number;
  expired: number;
  failed: number;
};

const CONCURRENCY = 25;

function pushConfiguration() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

function notificationBody(body: string) {
  return body.length <= 240 ? body : `${body.slice(0, 237)}...`;
}

async function runWithConcurrency<T>(items: T[], task: (item: T) => Promise<void>) {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await task(item);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
}

export async function broadcastNoticePush(input: {
  title: string;
  body: string;
  urgency: NoticeUrgency;
}): Promise<PushBroadcastResult> {
  const config = pushConfiguration();
  if (!config) return { configured: false, attempted: 0, delivered: 0, expired: 0, failed: 0 };

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  if (error) throw new Error("Unable to load push subscriptions.");

  const subscriptions = (data ?? []) as PushSubscriptionRow[];
  const expiredIds: string[] = [];
  let delivered = 0;
  let failed = 0;

  const payload = JSON.stringify({
    title: input.urgency === "urgent" ? `Urgent: ${input.title}` : input.title,
    body: notificationBody(input.body),
    url: "/notices",
  });

  await runWithConcurrency(subscriptions, async (subscription) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
        { TTL: input.urgency === "urgent" ? 86_400 : 21_600 }
      );
      delivered += 1;
    } catch (error: unknown) {
      const statusCode = typeof error === "object" && error !== null && "statusCode" in error
        ? Number(error.statusCode)
        : 0;

      if (statusCode === 404 || statusCode === 410) {
        expiredIds.push(subscription.id);
      } else {
        failed += 1;
      }
    }
  });

  if (expiredIds.length) {
    const { error: deleteError } = await admin.from("push_subscriptions").delete().in("id", expiredIds);
    if (deleteError) throw new Error("Unable to remove expired push subscriptions.");
  }

  return {
    configured: true,
    attempted: subscriptions.length,
    delivered,
    expired: expiredIds.length,
    failed,
  };
}
