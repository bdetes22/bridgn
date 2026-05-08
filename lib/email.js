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
  <div style="margin-top:36px;padding-top:20px;border-top:1px solid #e5e7eb;text-align:center;">
    <a href="https://bridgn.com" style="text-decoration:none;"><img src="https://bridgn.com/assets/bridgn%20logos/PNG/bridgn-01.png" alt="bridgn" style="height:24px;width:auto;opacity:.6;" /></a>
    <div style="font-size:11px;color:#9ca3af;margin-top:8px;line-height:1.5;">The creator-brand partnership platform</div>
    <div style="margin-top:8px;">
      <a href="https://bridgn.com" style="font-size:11px;color:#9ca3af;text-decoration:none;margin:0 8px;">Website</a>
      <span style="color:#d1d5db;">·</span>
      <a href="https://bridgn.com?page=terms" style="font-size:11px;color:#9ca3af;text-decoration:none;margin:0 8px;">Terms</a>
      <span style="color:#d1d5db;">·</span>
      <a href="https://bridgn.com?page=privacy" style="font-size:11px;color:#9ca3af;text-decoration:none;margin:0 8px;">Privacy</a>
    </div>
  </div>
`;

function btn(text, url, color = "#5b8af5") {
  return `<a href="${url}" style="display:block;text-align:center;padding:14px 32px;background:${color};color:white;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;margin:20px 0;">${text}</a>`;
}

function card(content, borderColor = "#e5e7eb") {
  return `<div style="margin:16px 0;padding:20px 24px;background:#f9fafb;border:1px solid ${borderColor};border-radius:12px;">${content}</div>`;
}

function badge(text, color = "#5b8af5", bg = "#eff6ff") {
  return `<span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;color:${color};background:${bg};letter-spacing:.03em;">${text}</span>`;
}

function wrap(content) {
  return `
    <div style="background:#f3f4f6;padding:32px 16px;">
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:540px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06);">
        <div style="background:linear-gradient(135deg,#0f4c81,#1a7fa8);padding:24px 32px;text-align:center;">
          <a href="https://bridgn.com" style="text-decoration:none;"><img src="https://bridgn.com/assets/bridgn%20logos/PNG/bridgn-01.png" alt="bridgn" style="height:32px;width:auto;filter:brightness(10);" /></a>
        </div>
        <div style="padding:32px 32px 24px;color:#1f2937;">
          ${content}
        </div>
        <div style="padding:0 32px 32px;">
          ${footer}
        </div>
      </div>
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

// ── Deal invite — sent when a deal is created (to brand or creator) ─────────

function dealInviteEmail({ recipientName, senderName, senderRole, dealTitle, amount, platform, deliverables, deadline, inviteLink }) {
  const isBrandInvite = senderRole === "creator"; // creator invites brand
  const platformIcons = {Instagram:"📸",TikTok:"🎵",YouTube:"▶️",Twitter:"𝕏",Multiple:"🌐"};
  return {
    subject: `${senderName} invited you to a deal on bridgn`,
    html: wrap(`
      <p style="font-size:16px;font-weight:700;margin:0 0 8px;">Hi${recipientName ? " " + recipientName : ""},</p>
      <p style="font-size:14px;color:#4b5563;line-height:1.7;margin:0 0 20px;">
        <strong>${senderName}</strong> wants to partner with you on <strong>bridgn</strong>.
      </p>
      ${card(`
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;">DEAL DETAILS</div>
          ${badge(platform || "—", platformIcons[platform] ? "#374151" : "#6b7280", "#f0f0f0")}
        </div>
        <div style="font-size:18px;font-weight:700;color:#1f2937;margin-bottom:4px;">${dealTitle}</div>
        <div style="display:flex;gap:24px;margin-top:16px;">
          <div><div style="font-size:22px;font-weight:800;color:#0f4c81;">$${(amount || 0).toLocaleString()}</div><div style="font-size:11px;color:#9ca3af;margin-top:2px;">Deal Value</div></div>
          <div><div style="font-size:14px;font-weight:600;color:#374151;">${deadline || "TBD"}</div><div style="font-size:11px;color:#9ca3af;margin-top:2px;">Deadline</div></div>
          ${platform ? `<div><div style="font-size:14px;font-weight:600;color:#374151;">${platformIcons[platform]||""} ${platform}</div><div style="font-size:11px;color:#9ca3af;margin-top:2px;">Platform</div></div>` : ""}
        </div>
        ${deliverables ? `<div style="margin-top:14px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">Deliverables: <strong style="color:#374151;">${deliverables}</strong></div>` : ""}
      `, "#5b8af5")}
      ${isBrandInvite ? `<div style="padding:12px 16px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;margin-bottom:8px;font-size:13px;color:#059669;font-weight:600;">🎉 Your first deal is free — no platform fees!</div>` : ""}
      ${btn(isBrandInvite ? "Join Deal on bridgn →" : "View Deal on bridgn →", inviteLink)}
      <p style="font-size:12px;color:#9ca3af;margin-top:8px;line-height:1.5;text-align:center;">
        ${isBrandInvite
          ? "Create a free account to manage deliverables, messaging, and payments — all in one place."
          : "Sign in to view the deal details and get started."}
      </p>
    `),
  };
}

// ── Content LIVE — notify brand that content has been published ──────────────

function contentLiveEmail({ brandName, creatorName, dealTitle, postLink, remainingAmount, dueDate }) {
  return {
    subject: `🟢 Content is LIVE — ${dealTitle}`,
    html: wrap(`
      <p style="font-size:16px;font-weight:700;margin:0 0 8px;">Hi ${brandName || "there"},</p>
      <p style="font-size:14px;color:#4b5563;line-height:1.7;margin:0 0 4px;">
        <strong>${creatorName}</strong> has published the content for <strong>${dealTitle}</strong>.
      </p>
      ${card(`
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          ${badge("LIVE", "#16a34a", "#dcfce7")}
          <span style="font-size:15px;font-weight:700;color:#1f2937;">${dealTitle}</span>
        </div>
        ${postLink ? `<a href="${postLink}" style="display:block;font-size:13px;color:#5b8af5;word-break:break-all;margin-bottom:8px;">${postLink}</a>` : ""}
        ${remainingAmount ? `
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid #e5e7eb;">
            <div style="font-size:11px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">REMAINING BALANCE</div>
            <div style="font-size:20px;font-weight:800;color:#d97706;">$${remainingAmount}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px;">Due by ${dueDate || "30 days from now"}</div>
          </div>
        ` : ""}
      `, "#16a34a")}
      ${btn("View in Deal Room →", "https://bridgn.com")}
    `),
  };
}

// ── Payment overdue — notify brand that payment is past due ─────────────────

function paymentOverdueEmail({ brandName, dealTitle, amount, daysOverdue }) {
  return {
    subject: `⚠️ Payment overdue — ${dealTitle}`,
    html: wrap(`
      <p style="font-size:16px;font-weight:700;margin:0 0 8px;">Hi ${brandName || "there"},</p>
      ${card(`
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          ${badge("OVERDUE" + (daysOverdue ? " · " + daysOverdue + " DAYS" : ""), "#ef4444", "#fef2f2")}
        </div>
        <div style="font-size:15px;font-weight:700;color:#1f2937;margin-bottom:8px;">${dealTitle}</div>
        <div style="font-size:28px;font-weight:800;color:#ef4444;">$${amount}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">Remaining balance past due</div>
      `, "#ef4444")}
      <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0 0 4px;">Please pay as soon as possible to avoid account restrictions.</p>
      ${btn("Pay Now →", "https://bridgn.com", "#ef4444")}
      <p style="font-size:12px;color:#9ca3af;margin-top:8px;line-height:1.5;text-align:center;">
        Your account may be flagged if the balance is not settled within 15 days.
      </p>
    `),
  };
}

// ── Deadline reminder — sent at 7d, 3d, 24h before deadline ─────────────────

function deadlineReminderEmail({ recipientName, dealTitle, deadline, daysLeft, partnerName }) {
  const urgency = daysLeft <= 1 ? "Tomorrow" : `In ${daysLeft} Days`;
  const urgencyColor = daysLeft <= 1 ? "#ef4444" : daysLeft <= 3 ? "#f59e0b" : "#5b8af5";
  return {
    subject: `Deadline ${urgency.toLowerCase()} — ${dealTitle}`,
    html: wrap(`
      <p style="font-size:15px;font-weight:600;margin:0 0 8px;">Hi ${recipientName || "there"},</p>
      <div style="margin:0 0 16px;padding:14px 18px;background:${urgencyColor}0d;border:1px solid ${urgencyColor}33;border-radius:10px;">
        <div style="font-size:13px;font-weight:700;color:${urgencyColor};margin-bottom:4px;">Deadline ${urgency}</div>
        <div style="font-size:14px;color:#374151;line-height:1.5;">
          <strong>${dealTitle}</strong> with <strong>${partnerName}</strong> is due <strong>${deadline}</strong>.
        </div>
      </div>
      <p style="font-size:14px;color:#4b5563;line-height:1.6;margin:0 0 20px;">
        Head to the Deal Room to check on progress and make sure everything is on track.
      </p>
      <a href="https://bridgn.com" style="display:inline-block;padding:10px 24px;background:#5b8af5;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
        Open Deal Room
      </a>
    `),
  };
}

// ── Welcome email — sent on first signup ───────────────────────────────────

function welcomeEmail({ name, role }) {
  const isCreator = role === "creator";
  return {
    subject: `Welcome to bridgn${name ? ", " + name.split(" ")[0] : ""} — let's get started`,
    html: wrap(`
      <p style="font-size:15px;font-weight:600;margin:0 0 8px;">Welcome to bridgn${name ? ", " + name : ""}!</p>
      <p style="font-size:14px;color:#4b5563;line-height:1.7;margin:0 0 20px;">
        You just joined the platform that's changing how ${isCreator ? "creators and brands work together" : "brands partner with creators"}. No more chasing payments, losing contracts in email threads, or wondering where things stand.
      </p>

      <div style="margin:0 0 24px;padding:20px 24px;background:linear-gradient(135deg,#f0f4ff,#faf5ff);border:1px solid #e0e7ff;border-radius:12px;">
        <div style="font-size:13px;font-weight:700;color:#4338ca;margin-bottom:14px;text-transform:uppercase;letter-spacing:.06em;">What you can do on bridgn</div>
        ${isCreator ? `
          <div style="display:flex;gap:10px;margin-bottom:12px;align-items:flex-start;">
            <span style="font-size:18px;flex-shrink:0;">🤝</span>
            <div><div style="font-size:14px;font-weight:600;color:#1f2937;">Manage brand deals in one place</div><div style="font-size:13px;color:#6b7280;margin-top:2px;">Briefs, contracts, content delivery, and messaging — all in your Deal Room.</div></div>
          </div>
          <div style="display:flex;gap:10px;margin-bottom:12px;align-items:flex-start;">
            <span style="font-size:18px;flex-shrink:0;">💰</span>
            <div><div style="font-size:14px;font-weight:600;color:#1f2937;">Get paid securely with escrow</div><div style="font-size:13px;color:#6b7280;margin-top:2px;">Brands deposit funds upfront into escrow. Your money is protected until content is approved.</div></div>
          </div>
          <div style="display:flex;gap:10px;margin-bottom:12px;align-items:flex-start;">
            <span style="font-size:18px;flex-shrink:0;">📄</span>
            <div><div style="font-size:14px;font-weight:600;color:#1f2937;">Contracts built in</div><div style="font-size:13px;color:#6b7280;margin-top:2px;">Review, sign, and store partnership agreements. No more digging through email.</div></div>
          </div>
          <div style="display:flex;gap:10px;align-items:flex-start;">
            <span style="font-size:18px;flex-shrink:0;">📊</span>
            <div><div style="font-size:14px;font-weight:600;color:#1f2937;">Track your earnings</div><div style="font-size:13px;color:#6b7280;margin-top:2px;">See your income by month, by brand, and set monthly goals.</div></div>
          </div>
        ` : `
          <div style="display:flex;gap:10px;margin-bottom:12px;align-items:flex-start;">
            <span style="font-size:18px;flex-shrink:0;">🤝</span>
            <div><div style="font-size:14px;font-weight:600;color:#1f2937;">Manage creator partnerships end-to-end</div><div style="font-size:13px;color:#6b7280;margin-top:2px;">Send briefs, review content, approve deliverables, and message — all in one Deal Room.</div></div>
          </div>
          <div style="display:flex;gap:10px;margin-bottom:12px;align-items:flex-start;">
            <span style="font-size:18px;flex-shrink:0;">🔒</span>
            <div><div style="font-size:14px;font-weight:600;color:#1f2937;">Flexible escrow payments</div><div style="font-size:13px;color:#6b7280;margin-top:2px;">Set your own upfront percentage. Only release funds when you're satisfied with the content.</div></div>
          </div>
          <div style="display:flex;gap:10px;margin-bottom:12px;align-items:flex-start;">
            <span style="font-size:18px;flex-shrink:0;">📋</span>
            <div><div style="font-size:14px;font-weight:600;color:#1f2937;">Content review & approval</div><div style="font-size:13px;color:#6b7280;margin-top:2px;">Review deliverables, request revisions, and approve content — all tracked with a paper trail.</div></div>
          </div>
          <div style="display:flex;gap:10px;align-items:flex-start;">
            <span style="font-size:18px;flex-shrink:0;">🎯</span>
            <div><div style="font-size:14px;font-weight:600;color:#1f2937;">Your first deal is free</div><div style="font-size:13px;color:#6b7280;margin-top:2px;">No platform fees on your first partnership. See why brands are switching to bridgn.</div></div>
          </div>
        `}
      </div>

      <p style="font-size:14px;color:#4b5563;line-height:1.7;margin:0 0 24px;">
        ${isCreator
          ? "Ready to bring a deal onto bridgn? Create your first deal and invite the brand — it takes less than a minute."
          : "Ready to get started? Create a deal and invite a creator, or browse creator profiles to find your next partner."}
      </p>

      <a href="https://bridgn.com" style="display:inline-block;padding:14px 32px;background:#5b8af5;color:white;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">
        ${isCreator ? "Create Your First Deal" : "Get Started on bridgn"}
      </a>

      <p style="font-size:13px;color:#9ca3af;margin-top:24px;line-height:1.6;">
        Questions? Just reply to this email — we read every one.
      </p>
    `),
  };
}

module.exports = {
  sendEmail,
  welcomeEmail,
  paymentSettledEmail,
  contentSubmittedEmail,
  scriptSharedEmail,
  briefSubmittedEmail,
  contractSentEmail,
  contractSignedEmail,
  newMessageEmail,
  dealInviteEmail,
  deadlineReminderEmail,
  contentLiveEmail,
  paymentOverdueEmail,
};
