import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const inactivePage = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>bridgn</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#a1a5b3}
    .wrap{text-align:center;padding:40px 20px;max-width:400px}
    .logo{font-size:28px;font-weight:800;letter-spacing:-1px;color:#5b8af5;margin-bottom:20px}
    h1{font-size:18px;color:#fff;margin:0 0 8px;font-weight:600}
    p{font-size:14px;line-height:1.6;margin:0 0 20px}
    a{color:#5b8af5;text-decoration:none;font-weight:600}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">bridgn</div>
    <h1>This link is no longer active</h1>
    <p>The affiliate link you followed has been deactivated or doesn't exist.</p>
    <a href="https://bridgn.com">Go to bridgn.com &rarr;</a>
  </div>
</body>
</html>`;

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
      },
    });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response(inactivePage, {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // 1. Look up the code
    const { data: links, error: lookupErr } = await db
      .from("affiliate_links")
      .select("*")
      .eq("code", code)
      .limit(1);

    if (lookupErr) {
      console.error("[affiliate-redirect] Lookup error:", lookupErr);
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const link = links?.[0];

    // 2. Not found or inactive
    if (!link || link.is_active === false) {
      return new Response(inactivePage, {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const userAgent = req.headers.get("user-agent") || null;
    const referrer = req.headers.get("referer") || null;

    // 3. Type: link — track click + redirect
    if (link.type === "link") {
      // Increment clicks atomically
      db.rpc("increment_affiliate_clicks", { link_code: code }).catch((e) =>
        console.error("[affiliate-redirect] RPC error:", e)
      );

      // Insert click record
      db.from("affiliate_clicks")
        .insert({
          link_code: code,
          user_agent: userAgent,
          referrer: referrer,
        })
        .then(({ error }) => {
          if (error) console.error("[affiliate-redirect] Click insert error:", error);
        });

      const destination = link.destination_url || "https://bridgn.com";

      return new Response(null, {
        status: 301,
        headers: {
          Location: destination,
          "Cache-Control": "no-cache, no-store",
        },
      });
    }

    // 4. Type: code — validate promo code + track
    if (link.type === "code") {
      // Increment clicks (code lookups count as "clicks")
      db.rpc("increment_affiliate_clicks", { link_code: code }).catch(() => {});

      return new Response(
        JSON.stringify({
          valid: true,
          code: link.code,
          campaign_name: link.campaign_name,
          commission_rate: link.commission_rate,
          commission_type: link.commission_type,
          creator_name: link.creator_name,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
          },
        }
      );
    }

    // Unknown type — redirect to bridgn.com
    return new Response(null, {
      status: 302,
      headers: { Location: "https://bridgn.com" },
    });
  } catch (err) {
    console.error("[affiliate-redirect] Unhandled error:", err);
    return new Response(inactivePage, {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
});
