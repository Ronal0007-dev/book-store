const { v4: uuidv4 } = require('uuid');
const { sequelize, Order, OrderItem, CartItem } = require('../models');
const { getOrCreateCart } = require('./cartController');

// Creates a "pending" order (with total price) from the user's current cart.
// The user then calls POST /api/payments/initiate with this order's id to pay.
exports.checkout = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const cart = await getOrCreateCart(req.user.id);
    const items = await CartItem.findAll({ where: { cartId: cart.id }, transaction: t });

    if (!items.length) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Your cart is empty.' });
    }

    const total = items.reduce((sum, i) => sum + parseFloat(i.unitPrice) * i.quantity, 0);

    const order = await Order.create({
      orderNumber: `ORD-${Date.now()}-${uuidv4().slice(0, 6).toUpperCase()}`,
      userId: req.user.id,
      totalAmount: total.toFixed(2),
      status: 'pending'
    }, { transaction: t });

    await Promise.all(items.map((i) => OrderItem.create({
      orderId: order.id,
      itemType: i.itemType,
      itemId: i.itemId,
      accessType: i.accessType,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: (parseFloat(i.unitPrice) * i.quantity).toFixed(2)
    }, { transaction: t })));

    // Cart is left intact until payment succeeds; cleared in payment callback.
    await t.commit();

    return res.status(201).json({
      success: true,
      message: 'Order created. Proceed to payment.',
      order: { id: order.id, orderNumber: order.orderNumber, totalAmount: order.totalAmount, status: order.status }
    });
  } catch (err) {
    await t.rollback();
    return res.status(500).json({ success: false, message: 'Checkout failed.', error: err.message });
  }
};

exports.getOrder = async (req, res) => {
  try {
    const order = await Order.findOne({
      where: { id: req.params.id, userId: req.user.id },
      include: [{ model: OrderItem }]
    });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    return res.json({ success: true, order });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not load order.', error: err.message });
  }
};

exports.myOrders = async (req, res) => {
  try {
    const orders = await Order.findAll({ where: { userId: req.user.id }, order: [['createdAt', 'DESC']] });
    return res.json({ success: true, orders });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not load orders.', error: err.message });
  }
};
