const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (!process.env.SMTP_HOST) return null; // not configured
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: parseInt(process.env.SMTP_PORT, 10) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
  return transporter;
}

/**
 * Sends the password reset email. If SMTP isn't configured (e.g. local dev),
 * falls back to logging the link to the server console so the flow still
 * works end-to-end without needing real mail credentials.
 */
async function sendPasswordResetEmail(user, resetUrl) {
  const t = getTransporter();

  if (!t) {
    console.log('\n[emailService] SMTP not configured - password reset link for', user.email, ':\n', resetUrl, '\n');
    return { delivered: false, viaConsole: true };
  }

  await t.sendMail({
    from: process.env.SMTP_FROM || 'no-reply@example.com',
    to: user.email,
    subject: 'Reset your Tafuta Books password',
    text: `Hi ${user.name},\n\nWe received a request to reset your password. This link expires in 1 hour:\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
    html: `
      <p>Hi ${user.name},</p>
      <p>We received a request to reset your password. This link expires in <strong>1 hour</strong>:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `
  });

  return { delivered: true, viaConsole: false };
}

module.exports = { sendPasswordResetEmail };
