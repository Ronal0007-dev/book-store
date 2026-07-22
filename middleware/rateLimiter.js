const rateLimit = require('express-rate-limit');

/**
 * Global limiter: caps how many requests a single IP address can make in a
 * rolling time window. Applied to all /api routes.
 */
const apiLimiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 10) || 15) * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip, // one bucket per IP address
  message: { success: false, message: 'Too many requests from this IP address. Please try again later.' }
});

/**
 * Stricter limiter for sensitive auth endpoints (login/register) to slow down
 * brute-force / credential-stuffing attempts from a single IP.
 */
const authLimiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 10) || 15) * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { success: false, message: 'Too many authentication attempts from this IP address. Please try again later.' }
});

/**
 * Very strict limiter for payment initiation to prevent abuse of the mobile
 * money provider APIs from a single IP.
 */
const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { success: false, message: 'Too many payment attempts from this IP address. Please try again later.' }
});

module.exports = { apiLimiter, authLimiter, paymentLimiter };
