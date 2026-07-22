const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { validationResult } = require('express-validator');
const { User, Cart } = require('../models');
const { sendPasswordResetEmail } = require('../services/emailService');

const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function setAuthCookie(res, token) {
  res.cookie(process.env.JWT_COOKIE_NAME || 'token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, authProvider: user.authProvider, avatarUrl: user.avatarUrl };
}

exports.register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { name, email, phone, password } = req.body;

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const user = await User.create({ name, email, phone, password, role: 'user', authProvider: 'local' });
    await Cart.create({ userId: user.id });

    const token = signToken(user);
    setAuthCookie(res, token);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      token,
      user: publicUser(user)
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Registration failed.', error: err.message });
  }
};

exports.login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });

    if (!user || !(await user.validPassword(password))) {
      if (user && user.authProvider === 'google' && !user.password) {
        return res.status(401).json({ success: false, message: 'This account signs in with Google. Use the "Continue with Google" button.' });
      }
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'This account has been deactivated.' });
    }

    const token = signToken(user);
    setAuthCookie(res, token);

    return res.json({
      success: true,
      message: 'Logged in successfully.',
      token,
      user: publicUser(user)
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Login failed.', error: err.message });
  }
};

// Sign in (or silently register, if this is their first time) with a Google
// ID token obtained client-side via Google Identity Services. Works for both
// login and registration - Google verifying the email is proof enough to
// either create a new account or link to an existing one with the same email.
exports.googleAuth = async (req, res) => {
  try {
    if (!googleClient) {
      return res.status(503).json({ success: false, message: 'Google sign-in is not configured on this server.' });
    }

    const { credential } = req.body;
    if (!credential) return res.status(400).json({ success: false, message: 'Missing Google credential.' });

    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload || !payload.email_verified) {
      return res.status(401).json({ success: false, message: 'Could not verify your Google account.' });
    }

    let user = await User.findOne({ where: { googleId: payload.sub } });

    if (!user) {
      // No account linked to this Google ID yet - check if the email is
      // already registered locally, and link it; otherwise create a new account.
      user = await User.findOne({ where: { email: payload.email } });
      if (user) {
        await user.update({ googleId: payload.sub, avatarUrl: user.avatarUrl || payload.picture });
      } else {
        user = await User.create({
          name: payload.name || payload.email.split('@')[0],
          email: payload.email,
          googleId: payload.sub,
          avatarUrl: payload.picture,
          authProvider: 'google',
          role: 'user'
        });
        await Cart.create({ userId: user.id });
      }
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'This account has been deactivated.' });
    }

    const token = signToken(user);
    setAuthCookie(res, token);

    return res.json({ success: true, message: 'Signed in with Google.', token, user: publicUser(user) });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Google sign-in failed.', error: err.message });
  }
};

exports.logout = (req, res) => {
  res.clearCookie(process.env.JWT_COOKIE_NAME || 'token');
  return res.json({ success: true, message: 'Logged out successfully.' });
};

exports.me = async (req, res) => {
  return res.json({ success: true, user: publicUser(req.user) });
};

// --- Password reset ---

// Always responds with the same generic success message whether or not the
// email exists, so this endpoint can't be used to enumerate registered emails.
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

    const genericResponse = { success: true, message: 'If an account exists for that email, a reset link has been sent.' };

    const user = await User.findOne({ where: { email } });
    if (!user || !user.isActive) return res.json(genericResponse);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await user.update({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    });

    const resetUrl = `${process.env.APP_BASE_URL || ''}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;
    await sendPasswordResetEmail(user, resetUrl);

    return res.json(genericResponse);
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not process password reset request.', error: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, token, password } = req.body;
    if (!email || !token || !password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Email, token, and a password (6+ chars) are required.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { Op } = require('sequelize');
    const user = await User.findOne({
      where: {
        email,
        resetPasswordTokenHash: tokenHash,
        resetPasswordExpires: { [Op.gt]: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    await user.update({ password, resetPasswordTokenHash: null, resetPasswordExpires: null });

    return res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not reset password.', error: err.message });
  }
};
