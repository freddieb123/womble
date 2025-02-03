import sgMail from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  throw new Error('SendGrid API key is required');
}

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailOptions) {
  try {
    await sgMail.send({
      to,
      from: process.env.SENDGRID_FROM_EMAIL || 'noreply@yourdomain.com',
      subject,
      html,
    });
    return true;
  } catch (error) {
    console.error('SendGrid error:', error);
    return false;
  }
}

export function generatePasswordResetEmail(username: string, resetToken: string) {
  const resetUrl = `${process.env.APP_URL || 'http://localhost:5000'}/reset-password?token=${resetToken}`;
  
  return {
    subject: 'Password Reset Request',
    html: `
      <h1>Password Reset Request</h1>
      <p>Hello ${username},</p>
      <p>You requested a password reset. Click the link below to reset your password:</p>
      <a href="${resetUrl}">Reset Password</a>
      <p>If you didn't request this, please ignore this email.</p>
      <p>This link will expire in 1 hour.</p>
    `,
  };
}
