import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "bridgn <notifications@bridgn.com>";
const CTA_URL = "https://bridgn.com";

// ─── HTML email template ────────────────────────────────────────────────────

function buildEmail(
  heading: string,
  bodyLines: string[],
  ctaText: string,
  ctaUrl: string = CTA_URL
): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
        <!-- Logo -->
        <tr><td style="padding:0 0 28px;">
          <span style="font-size:28px;font-weight:800;letter-spacing:-1px;color:#5b8af5;">bridgn</span>
        </td></tr>
        <!-- Card -->
        <tr><td style="background:#1a1d28;border:1px solid #2a2d3a;border-radius:12px;padding:32px;">
          <!-- Heading -->
          <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#ffffff;line-height:1.3;">
            ${heading}
          </h1>
          <!-- Body -->
          ${bodyLines
            .map(
              (line) =>
                `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#a1a5b3;">${line}</p>`
            )
            .join("")}
          <!-- CTA Button -->
          <table cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
            <tr><td style="background:#5b8af5;border-radius:8px;">
              <a href="${ctaUrl}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;font-family:inherit;">
                ${ctaText}
              </a>
            </td></tr>
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 0 0;text-align:center;">
          <p style="margin:0;font-size:12px;color:#555a6b;line-height:1.5;">
            You're receiving this because you have an active deal on
            <a href="${CTA_URL}" style="color:#5b8af5;text-decoration:none;">bridgn</a>.
          </p>
          <p style="margin:8px 0 0;font-size:11px;color:#3a3e4d;">
            &copy; ${new Date().getFullYear()} bridgn &mdash; The creator-brand partnership platform
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Email types ────────────────────────────────────────────────────────────

interface EmailParams {
  to: string;
  type: string;
  recipientName?: string;
  senderName?: string;
  dealName?: string;
  amount?: string;
  [key: string]: unknown;
}

function getEmail(params: EmailParams): { subject: string; html: string } | null {
  const {
    type,
    recipientName = "there",
    senderName = "Someone",
    dealName = "your deal",
    amount,
  } = params;

  switch (type) {
    case "content_submitted":
      return {
        subject: `${dealName} — New content submitted for your review`,
        html: buildEmail(
          "New content ready for review",
          [
            `<strong style="color:#fff;">${senderName}</strong> has submitted content for <strong style="color:#fff;">${dealName}</strong>.`,
            `Log in to bridgn to review the submission, approve deliverables, and release payment when you're satisfied.`,
          ],
          "Review Content"
        ),
      };

    case "content_approved":
      return {
        subject: `Your content was approved — payment is on its way`,
        html: buildEmail(
          "Your content was approved! 🎉",
          [
            `<strong style="color:#fff;">${senderName}</strong> approved your content for <strong style="color:#fff;">${dealName}</strong>.`,
            `Your payment will be released within <strong style="color:#5b8af5;">2–3 business days</strong>. You'll receive a notification when funds hit your bank account.`,
          ],
          "View Deal Room"
        ),
      };

    case "content_revision":
      return {
        subject: `${dealName} — Revision requested`,
        html: buildEmail(
          "Revisions requested on your submission",
          [
            `<strong style="color:#fff;">${senderName}</strong> has requested revisions on your submission for <strong style="color:#fff;">${dealName}</strong>.`,
            `Log in to see their feedback and submit an updated version.`,
          ],
          "View Feedback"
        ),
      };

    case "new_message":
      return {
        subject: `New message from ${senderName} on ${dealName}`,
        html: buildEmail(
          `New message from ${senderName}`,
          [
            `<strong style="color:#fff;">${senderName}</strong> sent you a message about <strong style="color:#fff;">${dealName}</strong>.`,
            `Log in to read the full message and reply.`,
          ],
          "Reply Now"
        ),
      };

    case "deal_accepted":
      return {
        subject: `Your deal with ${senderName} is confirmed`,
        html: buildEmail(
          "Deal confirmed! 🤝",
          [
            `Your partnership with <strong style="color:#fff;">${senderName}</strong> for <strong style="color:#fff;">${dealName}</strong> is confirmed.`,
            `Log in to review the creative brief and get started on your deliverables.`,
          ],
          "Get Started"
        ),
      };

    case "brief_sent":
      return {
        subject: `${senderName} sent you a creative brief`,
        html: buildEmail(
          "You have a new creative brief",
          [
            `<strong style="color:#fff;">${senderName}</strong> has uploaded your creative brief for <strong style="color:#fff;">${dealName}</strong>.`,
            `You must acknowledge the brief before creating content. Review it carefully — it contains the campaign goals, tone guidance, and deliverable requirements.`,
          ],
          "View Brief"
        ),
      };

    case "escrow_funded":
      return {
        subject: `Payment secured — you are protected`,
        html: buildEmail(
          "Payment is secured in escrow 🔒",
          [
            `<strong style="color:#fff;">${senderName}</strong> has funded escrow for <strong style="color:#fff;">${dealName}</strong>.`,
            amount
              ? `<strong style="color:#5b8af5;">$${amount}</strong> is secured by bridgn and will release when your content is approved.`
              : `Funds are secured by bridgn and will release when your content is approved.`,
            `You're protected — the brand cannot withdraw the funds. Deliver your content and the payment is yours.`,
          ],
          "Open Deal Room"
        ),
      };

    default:
      return null;
  }
}

// ─── Handler ────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    const params: EmailParams = await req.json();

    if (!params.to || !params.type) {
      return new Response(JSON.stringify({ error: "to and type are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const email = getEmail(params);

    if (!email) {
      return new Response(JSON.stringify({ error: `Unknown email type: ${params.type}` }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Send via Resend API
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: params.to,
        subject: email.subject,
        html: email.html,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("[send-notification-email] Resend error:", resendData);
      return new Response(JSON.stringify({ error: "Failed to send email", detail: resendData }), {
        status: 502,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    return new Response(JSON.stringify({ sent: true, id: resendData.id }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    console.error("[send-notification-email]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
