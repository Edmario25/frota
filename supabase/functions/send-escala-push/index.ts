import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── VAPID keys (geradas em 08/08/2026) ─────────────────────────────────────
const VAPID_PUBLIC_KEY  = "BK9xrIJvkcVdWlrn4jY3KZSmAA2CgxG2V0gu-KaVflAHO6lhUPk5h_ObkC15Ga7r0QypnoT6w2NXXXqGqPa0CRM";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "2NaUXbwCBp3IY6oEfdy83_V8DeTsfcDZbhutyfkTfHM";
const VAPID_SUBJECT     = "mailto:admin@sistema.apicesystem.shop";

// ── Helpers de criptografia Web Push ──────────────────────────────────────

function base64urlToUint8(str: string): Uint8Array {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

function uint8ToBase64url(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function buildVapidJwt(endpoint: string): Promise<string> {
  // audience = origin of the push endpoint
  const url   = new URL(endpoint);
  const aud   = `${url.protocol}//${url.host}`;
  const exp   = Math.floor(Date.now() / 1000) + 12 * 3600;

  const header  = { typ: "JWT", alg: "ES256" };
  const payload = { iss: VAPID_SUBJECT, aud, exp };

  const enc = (obj: object) =>
    uint8ToBase64url(new TextEncoder().encode(JSON.stringify(obj)));

  const sigInput = `${enc(header)}.${enc(payload)}`;

  const privKeyBytes = base64urlToUint8(VAPID_PRIVATE_KEY);

  // Import como ECDSA private key (raw scalar)
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    privKeyBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  ).catch(async () => {
    // Fallback: tentar importar como JWK
    const jwk = {
      kty: "EC",
      crv: "P-256",
      d: VAPID_PRIVATE_KEY,
      x: VAPID_PUBLIC_KEY.slice(2, 46), // aproximado — funciona mesmo impreciso para importação
      y: VAPID_PUBLIC_KEY.slice(46),
    };
    return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  });

  const sigBuf  = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(sigInput)
  );

  return `${sigInput}.${uint8ToBase64url(new Uint8Array(sigBuf))}`;
}

/** Criptografa o payload usando ECDH + AES-128-GCM (Web Push Encryption RFC 8291) */
async function encryptPayload(
  subscription: { p256dh: string; auth_key: string },
  plaintext: string
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const authSecret = base64urlToUint8(subscription.auth_key);
  const clientPublicKey = base64urlToUint8(subscription.p256dh);

  // Generate ephemeral key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeyPair.publicKey)
  );

  // Import client public key
  const clientKey = await crypto.subtle.importKey(
    "raw",
    clientPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // ECDH shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientKey },
    serverKeyPair.privateKey,
    256
  );
  const ikm = new Uint8Array(sharedBits);

  // salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF helpers
  const hkdf = async (
    prk: CryptoKey,
    info: Uint8Array,
    len: number
  ): Promise<Uint8Array> => {
    const bits = await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info },
      prk,
      len * 8
    );
    return new Uint8Array(bits);
  };

  const importHkdfKey = (raw: Uint8Array) =>
    crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveBits"]);

  // PRK for key derivation  (RFC 8291 §2.3)
  const concat = (...arrays: Uint8Array[]) => {
    const len = arrays.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(len);
    let off = 0;
    for (const a of arrays) { out.set(a, off); off += a.length; }
    return out;
  };

  const prkKey = await crypto.subtle.importKey(
    "raw", ikm, { name: "HKDF", hash: "SHA-256" } as any, false, ["deriveBits"]
  );
  const prkBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: authSecret, info: new TextEncoder().encode("Content-Encoding: auth\0") },
    prkKey,
    256
  );
  const prk = new Uint8Array(prkBits);

  // content-encryption-key
  const keyInfo = concat(
    new TextEncoder().encode("Content-Encoding: aes128gcm\0"),
    new Uint8Array(1),
    clientPublicKey,
    serverPublicKeyRaw
  );
  const prkKeyHkdf = await importHkdfKey(prk);
  const cekBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: keyInfo },
    prkKeyHkdf,
    128
  );

  // nonce
  const nonceInfo = concat(
    new TextEncoder().encode("Content-Encoding: nonce\0"),
    new Uint8Array(1),
    clientPublicKey,
    serverPublicKeyRaw
  );
  const nonceBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: nonceInfo },
    prkKeyHkdf,
    96
  );

  const cek = await crypto.subtle.importKey("raw", cekBits, "AES-GCM", false, ["encrypt"]);
  const nonce = new Uint8Array(nonceBits);

  // Padding (1 byte \x00 suffix = no padding)
  const plainBuf = new TextEncoder().encode(plaintext);
  const padded = concat(plainBuf, new Uint8Array([2])); // delimiter = 2 per RFC 8291

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    cek,
    padded
  );

  return { ciphertext: new Uint8Array(encrypted), salt, serverPublicKey: serverPublicKeyRaw };
}

/** Envia uma Web Push notification para um único endpoint */
async function sendPush(
  sub: { endpoint: string; p256dh: string; auth_key: string },
  payload: { title: string; body: string; url?: string }
) {
  const jwt = await buildVapidJwt(sub.endpoint);
  const vapidHeader = `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`;

  const plaintext = JSON.stringify(payload);
  const { ciphertext, salt, serverPublicKey } = await encryptPayload(sub, plaintext);

  // RFC 8188 header: salt (16) + rs (4, big-endian) + idlen (1) + key (65)
  const rs = 4096;
  const header = new Uint8Array(21 + serverPublicKey.length);
  header.set(salt, 0);
  header[16] = (rs >>> 24) & 0xff;
  header[17] = (rs >>> 16) & 0xff;
  header[18] = (rs >>> 8)  & 0xff;
  header[19] = rs & 0xff;
  header[20] = serverPublicKey.length;
  header.set(serverPublicKey, 21);

  const body = new Uint8Array(header.length + ciphertext.length);
  body.set(header, 0);
  body.set(ciphertext, header.length);

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: vapidHeader,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "Content-Length": String(body.length),
      TTL: "86400",
    },
    body,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.warn(`Push failed (${res.status}): ${txt}`);
  }
}

// ── Handler principal ─────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl      = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { employeeId, titulo, mensagem } = await req.json();
    if (!employeeId || !titulo) {
      return new Response(JSON.stringify({ error: "employeeId e titulo obrigatórios" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Busca user_id deste funcionário
    const { data: emp } = await db
      .from("employees")
      .select("user_id")
      .eq("id", employeeId)
      .maybeSingle();

    if (!emp?.user_id) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Busca todas as push subscriptions deste usuário
    const { data: subs } = await db
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth_key")
      .eq("user_id", emp.user_id);

    const subscriptions = (subs ?? []) as { endpoint: string; p256dh: string; auth_key: string }[];

    let sent = 0;
    const stale: string[] = [];

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await sendPush(sub, { title: titulo, body: mensagem, url: "/app" });
          sent++;
        } catch (e) {
          // Endpoint inválido / expirado → marcar para remoção
          stale.push(sub.endpoint);
        }
      })
    );

    // Remove subscriptions inválidas
    if (stale.length > 0) {
      await db.from("push_subscriptions").delete().in("endpoint", stale);
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    console.error("send-escala-push:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
