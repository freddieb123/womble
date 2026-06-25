import sgMail from "@sendgrid/mail";

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "womblefeedback@gmail.com";
const FROM_NAME = process.env.SENDGRID_FROM_NAME || "Womble";

let configured = false;
function configure(): boolean {
  if (configured) return true;
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) return false;
  sgMail.setApiKey(apiKey);
  configured = true;
  return true;
}

/**
 * Sends an email via SendGrid. Returns true on success, false otherwise.
 * Never throws — callers can treat email as best-effort so it never blocks the
 * request that triggered it (e.g. registration must still succeed if email fails).
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  if (!configure()) {
    console.warn(
      `[email] SENDGRID_API_KEY not set — skipping email to ${options.to} ("${options.subject}")`,
    );
    return false;
  }

  try {
    await sgMail.send({
      to: options.to,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: options.subject,
      html: options.html,
    });
    return true;
  } catch (err: any) {
    console.error(
      "[email] Failed to send:",
      err?.response?.body ?? (err instanceof Error ? err.message : err),
    );
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
 * Welcome email sent to every new account.
 *
 * NOTE: The copy below is placeholder text. Replace the contents of `html`
 * (and `subject` if desired) with the final welcome copy when it's ready.
 */
export function generateWelcomeEmail(name: string) {
  const greeting = name ? `Hi ${name},` : "Hi,";

  return {
    subject: "Welcome to Womble",
    html: `
      <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
        <h1 style="font-size: 20px;">Welcome to Womble</h1>
        <p>${greeting}</p>
        <p>Thanks for signing up. [Placeholder welcome copy — replace this with the final text.]</p>
        <p style="margin: 24px 0;">
          <a href="${appUrl()}/dashboard" style="background: #15803d; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600; display: inline-block;">Get started</a>
        </p>
        <p style="font-size: 13px; color: #999; margin-top: 32px;">— The Womble team</p>
      </div>
    `,
  };
}
