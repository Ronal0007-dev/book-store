const { sequelize, Order, OrderItem, Payment, Purchase, CartItem, Cart } = require('../models');
const paymentService = require('../services/paymentService');

// Webhooks are called by the payment provider's servers, not by a logged-in
// user, so they can't carry a JWT. Instead we verify a shared secret that only
// we and the provider know, configured on each provider's dashboard as part
// of the callback URL (e.g. ".../callback/mpesa?secret=xxxx") or a header.
function verifyWebhookSecret(req, envVar) {
  const expected = process.env[envVar];
  if (!expected) {
    // No secret configured yet (e.g. still in initial sandbox setup) - log a
    // loud warning but don't silently accept forged callbacks in production.
    console.warn(`[payments] ${envVar} is not set - rejecting webhook. Configure it before going live.`);
    return false;
  }
  const provided = req.query.secret || req.headers['x-callback-secret'];
  return provided === expected;
}

// Step 1: user picks a provider (mpesa | mixbyyas) and phone number, we push
// an STK/USSD prompt to their phone for the order's total amount.
exports.initiatePayment = async (req, res) => {
  try {
    const { orderId, provider, phone } = req.body;

    if (!['mpesa', 'mixbyyas'].includes(provider)) {
      return res.status(400).json({ success: false, message: 'provider must be "mpesa" or "mixbyyas".' });
    }
    if (!phone) {
      return res.status(400).json({ success: false, message: 'A phone number is required.' });
    }

    const order = await Order.findOne({ where: { id: orderId, userId: req.user.id } });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    if (order.status === 'paid') return res.status(400).json({ success: false, message: 'This order has already been paid.' });

    const payment = await Payment.create({
      orderId: order.id,
      userId: req.user.id,
      provider,
      phone,
      amount: order.totalAmount,
      status: 'initiated'
    });

    const result = await paymentService.initiatePayment(provider, {
      phone,
      amount: order.totalAmount,
      orderNumber: order.orderNumber
    });

    await payment.update({
      status: result.success ? 'pending' : 'failed',
      providerReference: result.providerReference,
      providerResponse: JSON.stringify(result.raw),
      failureReason: result.success ? null : result.message
    });

    if (!result.success) {
      return res.status(502).json({ success: false, message: result.message });
    }

    await order.update({ paymentProvider: provider });

    return res.json({
      success: true,
      message: result.message || 'Payment request sent. Approve it on your phone to complete the purchase.',
      paymentId: payment.id
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not initiate payment.', error: err.message });
  }
};

// Shared logic: mark a payment + its order as paid, and grant Purchase access
// to every item in the order (buy = permanent, rent = expires after N days).
async function finalizePaidOrder(payment) {
  const t = await sequelize.transaction();
  try {
    const order = await Order.findByPk(payment.orderId, { include: [{ model: OrderItem }], transaction: t });
    if (!order) throw new Error('Order not found for payment');

    if (order.status !== 'paid') {
      await order.update({ status: 'paid', paidAt: new Date() }, { transaction: t });

      for (const item of order.OrderItems) {
        let expiresAt = null;
        if (item.accessType === 'rent') {
          // Pull rentDurationDays from the source Book/Exam
          const { Book, Exam } = require('../models');
          const Model = item.itemType === 'book' ? Book : Exam;
          const resource = await Model.findByPk(item.itemId, { transaction: t });
          const days = (resource && resource.rentDurationDays) || 30;
          expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        }

        await Purchase.findOrCreate({
          where: { userId: order.userId, itemType: item.itemType, itemId: item.itemId },
          defaults: { accessType: item.accessType, orderId: order.id, expiresAt },
          transaction: t
        });
      }

      // Clear the items that were just purchased out of the user's cart.
      const cart = await Cart.findOne({ where: { userId: order.userId }, transaction: t });
      if (cart) {
        for (const item of order.OrderItems) {
          await CartItem.destroy({ where: { cartId: cart.id, itemType: item.itemType, itemId: item.itemId }, transaction: t });
        }
      }
    }

    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// Webhook: called by Vodacom M-Pesa when a C2B push result is ready.
exports.mpesaCallback = async (req, res) => {
  if (!verifyWebhookSecret(req, 'MPESA_CALLBACK_SECRET')) {
    return res.status(401).json({ success: false, message: 'Invalid or missing callback secret.' });
  }
  try {
    const body = req.body;
    // The exact callback payload shape is defined by Vodacom's Open API docs;
    // commonly it includes output_ResponseCode / output_TransactionID /
    // input_ThirdPartyConversationID (== our orderNumber, sent as reference).
    const success = body.output_ResponseCode === 'INS-0';
    const reference = body.output_TransactionID || body.input_ThirdPartyConversationID;

    const payment = await Payment.findOne({ where: { providerReference: reference } })
      || await Payment.findOne({ where: { provider: 'mpesa' }, order: [['createdAt', 'DESC']] });

    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found.' });

    await payment.update({
      status: success ? 'success' : 'failed',
      providerResponse: JSON.stringify(body),
      failureReason: success ? null : (body.output_ResponseDesc || 'Payment failed')
    });

    if (success) await finalizePaidOrder(payment);

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Callback processing failed.', error: err.message });
  }
};

// Webhook: called by Mixx by Yas collections API when the requesttopay resolves.
exports.mixByYasCallback = async (req, res) => {
  if (!verifyWebhookSecret(req, 'MIXBYYAS_CALLBACK_SECRET')) {
    return res.status(401).json({ success: false, message: 'Invalid or missing callback secret.' });
  }
  try {
    const body = req.body;
    const success = (body.status || '').toUpperCase() === 'SUCCESSFUL';
    const reference = body.referenceId || body.externalId;

    const payment = await Payment.findOne({ where: { providerReference: reference } });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found.' });

    await payment.update({
      status: success ? 'success' : 'failed',
      providerResponse: JSON.stringify(body),
      failureReason: success ? null : (body.reason || 'Payment failed')
    });

    if (success) await finalizePaidOrder(payment);

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Callback processing failed.', error: err.message });
  }
};

// Lets the frontend poll for payment status (since mobile money confirmation is async).
exports.getPaymentStatus = async (req, res) => {
  try {
    const payment = await Payment.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found.' });
    return res.json({ success: true, status: payment.status, failureReason: payment.failureReason });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not fetch payment status.', error: err.message });
  }
};

exports.finalizePaidOrder = finalizePaidOrder; // exported for potential manual/admin reconciliation
