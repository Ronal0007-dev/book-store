const router = require('express').Router();
const paymentController = require('../../controllers/paymentController');
const { authenticate } = require('../../middleware/auth');
const { paymentLimiter } = require('../../middleware/rateLimiter');

// User-initiated: push a payment prompt to their phone.
router.post('/initiate', authenticate, paymentLimiter, paymentController.initiatePayment);
router.get('/:id/status', authenticate, paymentController.getPaymentStatus);

// Provider webhooks (called by Vodacom / Yas servers, not the browser - no JWT).
router.post('/callback/mpesa', paymentController.mpesaCallback);
router.post('/callback/mixbyyas', paymentController.mixByYasCallback);

module.exports = router;
