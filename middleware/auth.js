const jwt = require('jsonwebtoken');
const { User } = require('../models');

/**
 * Reads the JWT from the Authorization header ("Bearer <token>") or from a cookie,
 * verifies it, and attaches the authenticated user to req.user.
 */
async function authenticate(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies[process.env.JWT_COOKIE_NAME || 'token']) {
      token = req.cookies[process.env.JWT_COOKIE_NAME || 'token'];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid or expired session.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

/**
 * Optional auth: attaches req.user if a valid token is present, but does not block
 * the request otherwise. Used for public pages that show extra info to logged-in users.
 */
async function optionalAuthenticate(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies[process.env.JWT_COOKIE_NAME || 'token']) {
      token = req.cookies[process.env.JWT_COOKIE_NAME || 'token'];
    }
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    if (user && user.isActive) req.user = user;
  } catch (err) {
    // ignore invalid token for optional auth
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdminOrAbove()) {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.user || !req.user.isSuperAdmin()) {
    return res.status(403).json({ success: false, message: 'Super admin access required.' });
  }
  next();
}

/**
 * Same checks as authenticate/requireAdmin, but redirect to a page instead of
 * returning JSON — used on server-rendered Pug routes rather than /api/* routes.
 */
async function authenticateWeb(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies[process.env.JWT_COOKIE_NAME || 'token']) {
      token = req.cookies[process.env.JWT_COOKIE_NAME || 'token'];
    }
    if (!token) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    if (!user || !user.isActive) return res.redirect('/login');

    req.user = user;
    next();
  } catch (err) {
    return res.redirect('/login');
  }
}

function requireAdminWeb(req, res, next) {
  if (!req.user || !req.user.isAdminOrAbove()) return res.status(403).render('403', { user: req.user || null });
  next();
}

function requireSuperAdminWeb(req, res, next) {
  if (!req.user || !req.user.isSuperAdmin()) return res.status(403).render('403', { user: req.user || null });
  next();
}

module.exports = {
  authenticate,
  optionalAuthenticate,
  requireAdmin,
  requireSuperAdmin,
  authenticateWeb,
  requireAdminWeb,
  requireSuperAdminWeb
};
