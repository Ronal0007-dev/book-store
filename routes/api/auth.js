const router = require('express').Router();
const { body } = require('express-validator');
const authController = require('../../controllers/authController');
const { authenticate } = require('../../middleware/auth');
const { authLimiter } = require('../../middleware/rateLimiter');

router.post('/register', authLimiter, [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('A valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], authController.register);

router.post('/login', authLimiter, [
  body('email').isEmail().withMessage('A valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], authController.login);

router.post('/google', authLimiter, authController.googleAuth);

router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authLimiter, authController.resetPassword);

router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);

module.exports = router;
