const { Cart, CartItem, Book, Exam } = require('../models');

async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ where: { userId } });
  if (!cart) cart = await Cart.create({ userId });
  return cart;
}

async function resolveItemAndPrice(itemType, itemId, accessType) {
  const Model = itemType === 'book' ? Book : Exam;
  const item = await Model.findOne({ where: { id: itemId, isPublished: true } });
  if (!item) return null;
  if (accessType === 'rent' && !item.rentPrice) return null; // renting not offered for this item
  const unitPrice = accessType === 'rent' ? item.rentPrice : item.price;
  return { item, unitPrice };
}

exports.getCart = async (req, res) => {
  try {
    const cart = await getOrCreateCart(req.user.id);
    const items = await CartItem.findAll({ where: { cartId: cart.id } });

    const enriched = await Promise.all(items.map(async (ci) => {
      const Model = ci.itemType === 'book' ? Book : Exam;
      const item = await Model.findByPk(ci.itemId, { attributes: ['id', 'title', 'coverImage'] });
      return {
        id: ci.id,
        itemType: ci.itemType,
        itemId: ci.itemId,
        accessType: ci.accessType,
        title: item ? item.title : '(removed resource)',
        coverImage: item ? item.coverImage : null,
        unitPrice: ci.unitPrice,
        quantity: ci.quantity,
        lineTotal: (parseFloat(ci.unitPrice) * ci.quantity).toFixed(2)
      };
    }));

    const total = enriched.reduce((sum, i) => sum + parseFloat(i.lineTotal), 0);

    return res.json({ success: true, items: enriched, total: total.toFixed(2) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not load cart.', error: err.message });
  }
};

exports.addToCart = async (req, res) => {
  try {
    const { itemType, itemId, accessType = 'buy' } = req.body;
    if (!['book', 'exam'].includes(itemType) || !['buy', 'rent'].includes(accessType)) {
      return res.status(400).json({ success: false, message: 'Invalid item type or access type.' });
    }

    const resolved = await resolveItemAndPrice(itemType, itemId, accessType);
    if (!resolved) return res.status(404).json({ success: false, message: 'Resource not found or not available for that access type.' });

    const cart = await getOrCreateCart(req.user.id);

    const [cartItem, created] = await CartItem.findOrCreate({
      where: { cartId: cart.id, itemType, itemId, accessType },
      defaults: { unitPrice: resolved.unitPrice, quantity: 1 }
    });

    if (!created) {
      await cartItem.increment('quantity', { by: 1 });
    }

    return res.status(201).json({ success: true, message: 'Added to cart.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not add to cart.', error: err.message });
  }
};

exports.removeFromCart = async (req, res) => {
  try {
    const cart = await getOrCreateCart(req.user.id);
    const cartItem = await CartItem.findOne({ where: { id: req.params.itemId, cartId: cart.id } });
    if (!cartItem) return res.status(404).json({ success: false, message: 'Item not found in cart.' });
    await cartItem.destroy();
    return res.json({ success: true, message: 'Removed from cart.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not remove item.', error: err.message });
  }
};

exports.clearCart = async (req, res) => {
  try {
    const cart = await getOrCreateCart(req.user.id);
    await CartItem.destroy({ where: { cartId: cart.id } });
    return res.json({ success: true, message: 'Cart cleared.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not clear cart.', error: err.message });
  }
};

exports.getOrCreateCart = getOrCreateCart;
