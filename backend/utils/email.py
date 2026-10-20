"""Email sending via Resend. Gracefully no-ops if RESEND_API_KEY is missing."""
import os
import asyncio
import logging

logger = logging.getLogger(__name__)


async def send_email(to: str, subject: str, html: str, text: str = "") -> dict:
    """
    Send an email via Resend.
    Returns {"sent": bool, "id": str | None, "reason": str | None}.
    Never raises — caller can continue the flow if email fails.
    """
    api_key = os.environ.get("RESEND_API_KEY")
    sender = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")

    if not api_key:
        logger.warning("RESEND_API_KEY not set — skipping email to %s", to)
        return {"sent": False, "id": None, "reason": "no_api_key"}

    try:
        import resend
        resend.api_key = api_key
        params = {
            "from": sender,
            "to": [to],
            "subject": subject,
            "html": html,
        }
        if text:
            params["text"] = text
        result = await asyncio.to_thread(resend.Emails.send, params)
        return {"sent": True, "id": result.get("id"), "reason": None}
    except Exception as e:
        logger.error("Resend send failed: %s", e)
        return {"sent": False, "id": None, "reason": str(e)}


def build_invite_email_html(inviter_name: str, org_name: str, accept_url: str) -> str:
    """Simple inline-CSS HTML for invite emails."""
    return f"""
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0a0a0b;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="560" style="background:#111113;border:1px solid #26262a;border-radius:16px;padding:40px;max-width:560px;">
          <tr>
            <td>
              <div style="color:#818cf8;font-size:12px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:24px;">InFlow</div>
              <h1 style="color:#ffffff;font-size:24px;font-weight:700;margin:0 0 16px 0;line-height:1.2;">You're invited to join {org_name}</h1>
              <p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 8px 0;">
                <strong style="color:#e4e4e7;">{inviter_name}</strong> has invited you to join their team on InFlow — the revenue intelligence platform for sales teams.
              </p>
              <p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 32px 0;">
                Accept the invitation to collaborate on deals, share integrations, and run AI-powered analytics together.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#6366f1;border-radius:10px;">
                    <a href="{accept_url}" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">
                      Accept invitation
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color:#71717a;font-size:13px;line-height:1.5;margin:32px 0 0 0;">
                Or paste this link into your browser:<br/>
                <a href="{accept_url}" style="color:#818cf8;word-break:break-all;">{accept_url}</a>
              </p>
              <p style="color:#52525b;font-size:12px;margin:24px 0 0 0;">This invitation expires in 7 days.</p>
            </td>
          </tr>
        </table>
        <p style="color:#3f3f46;font-size:11px;margin-top:24px;">If you weren't expecting this, you can safely ignore this email.</p>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def build_notice_email_html(heading: str, paragraphs: list, cta_label: str = None, cta_url: str = None) -> str:
    """Generic InFlow notice email (account lifecycle etc.). Paragraphs are plain text; they're escaped here."""
    from html import escape
    body = "".join(
        f'<p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 14px 0;">{escape(p)}</p>' for p in paragraphs
    )
    button = ""
    if cta_label and cta_url:
        button = f"""
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:18px;">
                <tr>
                  <td style="background:#0052ff;border-radius:10px;">
                    <a href="{escape(cta_url)}" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">{escape(cta_label)}</a>
                  </td>
                </tr>
              </table>"""
    return f"""
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0a0a0b;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="560" style="background:#111113;border:1px solid #26262a;border-radius:16px;padding:40px;max-width:560px;">
          <tr>
            <td>
              <div style="color:#7aa6ff;font-size:12px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:24px;">InFlow · Account</div>
              <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 16px 0;line-height:1.3;">{escape(heading)}</h1>
              {body}{button}
              <p style="color:#52525b;font-size:12px;line-height:1.5;margin:28px 0 0 0;">If you didn't expect this email, contact us at support@inflowft.com.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""
