import { Resend } from "resend";

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

// Resend requires the "from" to be on a domain you've verified in Resend. Free
// webmail (e.g. gmail.com) is NOT allowed. Until a domain is verified you can use
// "onboarding@resend.dev", which only delivers to your own Resend account email.
// Set RESEND_FROM_EMAIL to e.g. "Womble <noreply@womblefeedback.com>" once the
// domain is verified.
const FROM = process.env.RESEND_FROM_EMAIL || "Womble <onboarding@resend.dev>";

// Replies go here. Sending is done from the verified domain (FROM), but since
// noreply@... isn't a real inbox, point replies at a monitored address.
const REPLY_TO = process.env.RESEND_REPLY_TO || "womblefeedback@gmail.com";

let client: Resend | null = null;
function getClient(): Resend | null {
  if (client) return client;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  client = new Resend(apiKey);
  return client;
}

/**
 * Sends an email via Resend. Returns true on success, false otherwise.
 * Never throws — callers can treat email as best-effort so it never blocks the
 * request that triggered it (e.g. registration must still succeed if email fails).
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const resend = getClient();
  if (!resend) {
    console.warn(
      `[email] RESEND_API_KEY not set — skipping email to ${options.to} ("${options.subject}")`,
    );
    return false;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: options.to,
      replyTo: REPLY_TO,
      subject: options.subject,
      html: options.html,
    });
    if (error) {
      console.error("[email] Resend rejected the send:", error);
      return false;
    }
    console.log(`[email] sent to ${options.to} (id: ${data?.id})`);
    return true;
  } catch (err: any) {
    console.error("[email] Failed to send:", err instanceof Error ? err.message : err);
    return false;
  }
}

function appUrl(): string {
  return process.env.APP_URL || "http://localhost:5000";
}

export function generatePasswordResetEmail(name: string, resetToken: string) {
  const resetUrl = `${appUrl()}/reset-password?token=${resetToken}`;
  const greeting = name ? `Hello ${name},` : "Hello,";

  return {
    subject: "Reset your Womble password",
    html: `
      <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
        <h1 style="font-size: 20px;">Reset your password</h1>
        <p>${greeting}</p>
        <p>We received a request to reset the password for your Womble account. Click the button below to choose a new password:</p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}" style="background: #15803d; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600; display: inline-block;">Reset password</a>
        </p>
        <p style="font-size: 13px; color: #555;">Or paste this link into your browser:<br>
          <a href="${resetUrl}">${resetUrl}</a>
        </p>
        <p style="font-size: 13px; color: #555;">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
        <p style="font-size: 13px; color: #999; margin-top: 32px;">— The Womble team</p>
      </div>
    `,
  };
}

/**
 * Welcome email sent to every new account. A short personal note from Fred.
 */
export function generateWelcomeEmail(_name?: string) {
  return {
    subject: "👋 Welcome to Womble",
    html: `
      <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
        <p>Hi there,</p>
        <p>Thanks so much for signing up to <a href="https://womblefeedback.com" style="color: #15803d;">Womble</a>. We're pretty new, so if you have any issues please let me know!</p>
        <p><strong>HUGE FAVOUR:</strong> please send through any feedback you have so I can make it better. We'd love to hear from you.</p>
        <p>Best,<br>Fred</p>
      </div>
    `,
  };
}
