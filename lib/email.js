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
        <a href="https://bridgn.com" style="text-decoration:none;"><img src="https://bridgn.com/assets/bridgn%20logos/PNG/bridgn-01.png" alt="bridgn" style="height:40px;width:auto;" /></a>
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

// ── Deal invite — sent when a deal is created (to brand or creator) ─────────

function dealInviteEmail({ recipientName, senderName, senderRole, dealTitle, amount, platform, deliverables, deadline, inviteLink }) {
  const isBrandInvite = senderRole === "creator"; // creator invites brand
  return {
    subject: `${senderName} invited you to a deal on bridgn`,
    html: wrap(`
      <p style="font-size:15px;font-weight:600;margin:0 0 8px;">Hi${recipientName ? " " + recipientName : ""},</p>
      <p style="font-size:14px;color:#4b5563;line-height:1.6;margin:0 0 16px;">
        <strong>${senderName}</strong> has set up your partnership deal on <strong>bridgn</strong> — the creator-brand deal platform.
      </p>
      <div style="margin:0 0 20px;padding:16px 20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:10px;">Deal Summary</div>
        <table style="width:100%;font-size:14px;color:#374151;line-height:1.6;">
          <tr><td style="padding:2px 0;color:#6b7280;">Campaign</td><td style="padding:2px 0;font-weight:600;text-align:right;">${dealTitle}</td></tr>
          <tr><td style="padding:2px 0;color:#6b7280;">Payment</td><td style="padding:2px 0;font-weight:600;text-align:right;">$${(amount || 0).toLocaleString()}</td></tr>
          <tr><td style="padding:2px 0;color:#6b7280;">Platform</td><td style="padding:2px 0;font-weight:600;text-align:right;">${platform || "—"}</td></tr>
          <tr><td style="padding:2px 0;color:#6b7280;">Deadline</td><td style="padding:2px 0;font-weight:600;text-align:right;">${deadline || "TBD"}</td></tr>
          ${deliverables ? `<tr><td style="padding:2px 0;color:#6b7280;">Deliverables</td><td style="padding:2px 0;font-weight:600;text-align:right;">${deliverables}</td></tr>` : ""}
        </table>
      </div>
      ${isBrandInvite
        ? `<p style="font-size:13px;color:#059669;font-weight:600;margin:0 0 16px;">Your first deal is free — no platform fees on your first partnership.</p>`
        : ""
      }
      <a href="${inviteLink}" style="display:inline-block;padding:12px 28px;background:#5b8af5;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
        ${isBrandInvite ? "Join Deal on bridgn" : "View Deal on bridgn"}
      </a>
      <p style="font-size:12px;color:#9ca3af;margin-top:16px;line-height:1.5;">
        ${isBrandInvite
          ? "You'll create a free brand account to manage deliverables, messaging, and payments — all in one place."
          : "Sign in to your bridgn account to view the deal details and get started."
        }
      </p>
    `),
  };
}

// ── Content LIVE — notify brand that content has been published ──────────────

function contentLiveEmail({ brandName, creatorName, dealTitle, postLink, remainingAmount, dueDate }) {
  return {
    subject: `Content is LIVE — ${dealTitle}`,
    html: wrap(`
      <p style="font-size:15px;font-weight:600;margin:0 0 8px;">Hi ${brandName || "there"},</p>
      <p style="font-size:14px;color:#4b5563;line-height:1.6;margin:0 0 16px;">
        <strong>${creatorName}</strong> has published the content for <strong>${dealTitle}</strong>.
      </p>
      ${postLink ? `
        <div style="margin:0 0 16px;padding:14px 18px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;">
          <div style="font-size:13px;font-weight:700;color:#16a34a;margin-bottom:6px;">🟢 Content is LIVE</div>
          <a href="${postLink}" style="font-size:14px;color:#5b8af5;word-break:break-all;">${postLink}</a>
        </div>
      ` : ""}
      ${remainingAmount ? `
        <div style="margin:0 0 16px;padding:14px 18px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
          <div style="font-size:13px;font-weight:700;color:#d97706;margin-bottom:4px;">Remaining Balance Due</div>
          <div style="font-size:14px;color:#374151;line-height:1.5;">
            <strong>$${remainingAmount}</strong> is due by <strong>${dueDate || "30 days from now"}</strong>.
          </div>
        </div>
      ` : ""}
      <a href="https://bridgn.com" style="display:inline-block;padding:12px 28px;background:#5b8af5;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
        View in Deal Room
      </a>
    `),
  };
}

// ── Payment overdue — notify brand that payment is past due ─────────────────

function paymentOverdueEmail({ brandName, dealTitle, amount, daysOverdue }) {
  return {
    subject: `Payment overdue — ${dealTitle}`,
    html: wrap(`
      <p style="font-size:15px;font-weight:600;margin:0 0 8px;">Hi ${brandName || "there"},</p>
      <div style="margin:0 0 16px;padding:14px 18px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;">
        <div style="font-size:13px;font-weight:700;color:#ef4444;margin-bottom:4px;">Payment Overdue${daysOverdue ? ` — ${daysOverdue} days past due` : ""}</div>
        <div style="font-size:14px;color:#374151;line-height:1.5;">
          Your remaining payment of <strong>$${amount}</strong> for <strong>${dealTitle}</strong> is past due. Please pay as soon as possible to avoid account restrictions.
        </div>
      </div>
      <a href="https://bridgn.com" style="display:inline-block;padding:12px 28px;background:#ef4444;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
        Pay Now
      </a>
      <p style="font-size:13px;color:#9ca3af;margin-top:16px;line-height:1.5;">
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
