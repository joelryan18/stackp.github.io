/* ============================================================
   AXON — razorpay-webhook · verified purchase activation
   Spec §4a: docs/superpowers/specs/2026-07-07-hobby-benefits-fulfillment-design.md
   Deploy with JWT verification OFF (Razorpay calls it):
     supabase functions deploy razorpay-webhook --no-verify-jwt
   ============================================================ */
import { createClient } from "jsr:@supabase/supabase-js@2";

const PLAN_AMOUNTS: Record<string, number> = { hobby: 500, studio: 699900 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function signatureValid(rawBody: string, header: string, secret: string): Promise<boolean> {
  const sig = hexToBytes(header);
  if (!sig) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  // crypto.subtle.verify is constant-time — never compare hex strings manually
  return crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(rawBody));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) return json(500, { error: "webhook_secret_not_configured" });

  const rawBody = await req.text();
  const header = req.headers.get("x-razorpay-signature") ?? "";
  if (!(await signatureValid(rawBody, header, secret))) {
    return json(401, { error: "bad_signature" });
  }

  // Authentic from here on. Authentic-but-invalid events answer 200 with a
  // logged skip — a non-2xx would make Razorpay retry-storm a hopeless event.
  const skip = (reason: string) => {
    console.warn("webhook skipped:", reason);
    return json(200, { skipped: true, reason });
  };

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return skip("unparseable_body"); }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  if (event.event === "payment.captured") {
    const p = event.payload?.payment?.entity;
    if (!p?.id) return skip("no_payment_entity");
    if (p.currency !== "INR") return skip("currency_mismatch");

    const plan = p.notes?.plan;
    if (!(plan in PLAN_AMOUNTS)) return skip("unknown_plan");
    if (p.amount !== PLAN_AMOUNTS[plan]) return skip("amount_mismatch");

    const uid = p.notes?.auth_uid;
    if (typeof uid !== "string" || !UUID_RE.test(uid)) return skip("bad_auth_uid");
    const { data: user, error: userErr } = await admin.auth.admin.getUserById(uid);
    if (userErr || !user?.user) return skip("auth_uid_not_found");

    const { error } = await admin.from("passes").upsert({
      user_id: uid,
      plan,
      payment_id: p.id,
      amount: p.amount,
      buyer_email: p.email || null,
      buyer_name: p.notes?.buyer_name || null,
    }, { onConflict: "payment_id", ignoreDuplicates: true }); // idempotent — Razorpay retries safely

    if (error) {
      console.error("pass insert failed:", error.message);
      return json(500, { error: "pass_insert_failed" }); // 5xx → Razorpay retries a transient failure
    }
    return json(200, { ok: true });
  }

  if (event.event === "refund.processed") {
    const paymentId = event.payload?.refund?.entity?.payment_id;
    if (!paymentId) return skip("no_refund_payment_id");
    const { error } = await admin.from("passes")
      .update({ status: "refunded" })
      .eq("payment_id", paymentId);
    if (error) {
      console.error("refund update failed:", error.message);
      return json(500, { error: "refund_update_failed" });
    }
    return json(200, { ok: true });
  }

  return json(200, { ignored: true });
});
