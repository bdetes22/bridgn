"use strict";

const { Resend } = require("resend");

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.EMAIL_FROM || "bridgn <notifications@bridgn.com>";

/**
 * Send an email. Silently no-ops if Resend isn't configured.
 */
async function sendEmail({ to, subject, html }) {
  if (!resend) {
    console.log("[email] Resend not configured, skipping:", subject, "→", to);
    return null;
  }
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });
    if (error) {
      console.error("[email] Send failed:", error);
      return null;
    }
    console.log("[email] Sent:", subject, "→", to, "id:", data?.id);
    return data;
  } catch (err) {
    console.error("[email] Error:", err.message);
    return null;
  }
}

// ─── Email templates ──────────────────────────────────────────────────────────

const footer = `
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
    <a href="https://bridgn.com" style="color:#5b8af5;text-decoration:none;font-weight:600;">bridgn</a> — The creator-brand partnership platform
  </div>
`;

function wrap(content) {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2937;">
      <div style="margin-bottom:20px;">
        <span style="font-size:22px;font-weight:800;background:linear-gradient(135deg,#5b8af5,#a78bfa,#f0a050);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">bridgn</span>
      </div>
      ${content}
      ${footer}
    </div>
  `;
}

// ── Payment settled — notify brand ──────────────────────────────────────────

function paymentSettledEmail({ brandName, creatorName, amount, dealTitle }) {
  return {
    subject: `Payment settled — $${amount} held in escrow`,
    html: wrap(`
      <p style="font-size:15px;font-weight:600;margin:0 0 8px;">Hi ${brandName},</p>
      <p style="font-size:14px;color:#4b5563;line-height:1.6;margin:0 0 16px;">
        Your ACH payment of <strong>$${amount}</strong> for <strong>${dealTitle}</strong> with
        <strong>${creatorName}</strong> has settled and is now held in escrow.
      </p>
      <p style="font-size:14px;color:#4b5563;line-height:1.6;margin:0 0 20px;">
        Once the creator delivers their content, head to the Deal Room to review and release payment.
      </p>
      <a href="https://bridgn.com" style="display:inline-block;padding:10px 24px;background:#5b8af5;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
        Open Deal Room
      </a>
    `),
  };
}

// ── Creator submitted content — notify brand ────────────────────────────────

function contentSubmittedEmail({ brandName, creatorName, fileName, dealTitle }) {
  return {
    subject: `${creatorName} submitted content for "${dealTitle}"`,
    html: wrap(`
      <p style="font-size:15px;font-weight:600;margin:0 0 8px;">Hi ${brandName},</p>
      <p style="font-size:14px;color:#4b5563;line-height:1.6;margin:0 0 16px;">
        <strong>${creatorName}</strong> has submitted content for review on <strong>${dealTitle}</strong>.
        ${fileName ? `<br/>File: <strong>${fileName}</strong>` : ""}
      </p>
      <p style="font-size:14px;color:#4b5563;line-height:1.6;margin:0 0 20px;">
        Head to the Deal Room to review, approve deliverables, and release payment.
      </p>
      <a href="https://bridgn.com" style="display:inline-block;padding:10px 24px;background:#5b8af5;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
        Review Content
      </a>
    `),
  };
}

// ── Script/draft shared — notify brand ──────────────────────────────────────

function scriptSharedEmail({ brandName, creatorName, scriptUrl, dealTitle }) {
  return {
    subject: `${creatorName} shared a script for "${dealTitle}"`,
    html: wrap(`
      <p style="font-size:15px;font-weight:600;margin:0 0 8px;">Hi ${brandName},</p>
      <p style="font-size:14px;color:#4b5563;line-height:1.6;margin:0 0 16px;">
        <strong>${creatorName}</strong> shared a script/draft for <strong>${dealTitle}</strong>.
      </p>
      ${scriptUrl ? `<p style="font-size:13px;margin:0 0 20px;"><a href="${scriptUrl}" style="color:#5b8af5;">${scriptUrl}</a></p>` : ""}
      <a href="https://bridgn.com" style="display:inline-block;padding:10px 24px;background:#5b8af5;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
        Open Deal Room
      </a>
    `),
  };
}

// ── Brief submitted — notify creator ────────────────────────────────────────

function briefSubmittedEmail({ creatorName, brandName, dealTitle }) {
  return {
    subject: `${brandName} sent you a creative brief`,
    html: wrap(`
      <p style="font-size:15px;font-weight:600;margin:0 0 8px;">Hi ${creatorName},</p>
      <p style="font-size:14px;color:#4b5563;line-height:1.6;margin:0 0 16px;">
        <strong>${brandName}</strong> has submitted a creative brief for <strong>${dealTitle}</strong>.
        Review it in the Deal Room and acknowledge it to get started.
      </p>
      <a href="https://bridgn.com" style="display:inline-block;padding:10px 24px;background:#5b8af5;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
        View Brief
      </a>
    `),
  };
}

// ── Contract sent — notify creator ──────────────────────────────────────────

function contractSentEmail({ creatorName, brandName, dealTitle, hasLink }) {
  return {
    subject: `${brandName} sent you a contract to sign`,
    html: wrap(`
      <p style="font-size:15px;font-weight:600;margin:0 0 8px;">Hi ${creatorName},</p>
      <p style="font-size:14px;color:#4b5563;line-height:1.6;margin:0 0 16px;">
        <strong>${brandName}</strong> has sent a contract for <strong>${dealTitle}</strong>.
        ${hasLink ? "Click through to sign it online, or " : ""}Head to the Deal Room to review and sign.
      </p>
      <a href="https://bridgn.com" style="display:inline-block;padding:10px 24px;background:#5b8af5;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
        Review Contract
      </a>
    `),
  };
}

// ── Contract signed — notify brand ──────────────────────────────────────────

function contractSignedEmail({ brandName, creatorName, dealTitle }) {
  return {
    subject: `${creatorName} signed the contract for "${dealTitle}"`,
    html: wrap(`
      <p style="font-size:15px;font-weight:600;margin:0 0 8px;">Hi ${brandName},</p>
      <p style="font-size:14px;color:#4b5563;line-height:1.6;margin:0 0 16px;">
        <strong>${creatorName}</strong> has signed the contract for <strong>${dealTitle}</strong>.
        The deal is ready to move forward.
      </p>
      <a href="https://bridgn.com" style="display:inline-block;padding:10px 24px;background:#5b8af5;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
        Open Deal Room
      </a>
    `),
  };
}

// ── New message — notify the other party ────────────────────────────────────

function newMessageEmail({ recipientName, senderName, messagePreview, dealTitle }) {
  return {
    subject: `New message from ${senderName} on "${dealTitle}"`,
    html: wrap(`
      <p style="font-size:15px;font-weight:600;margin:0 0 8px;">Hi ${recipientName},</p>
      <p style="font-size:14px;color:#4b5563;line-height:1.6;margin:0 0 4px;">
        <strong>${senderName}</strong> sent a message on <strong>${dealTitle}</strong>:
      </p>
      <div style="margin:12px 0 20px;padding:12px 16px;background:#f3f4f6;border-radius:8px;font-size:14px;color:#374151;line-height:1.5;">
        "${messagePreview}"
      </div>
      <a href="https://bridgn.com" style="display:inline-block;padding:10px 24px;background:#5b8af5;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
        Reply in Deal Room
      </a>
    `),
  };
}

module.exports = {
  sendEmail,
  paymentSettledEmail,
  contentSubmittedEmail,
  scriptSharedEmail,
  briefSubmittedEmail,
  contractSentEmail,
  contractSignedEmail,
  newMessageEmail,
};
