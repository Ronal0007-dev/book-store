const { Purchase, Book, Exam } = require('../models');

// A user can only ever see the books/exams they have paid for here.
exports.myLibrary = async (req, res) => {
  try {
    const purchases = await Purchase.findAll({ where: { userId: req.user.id } });

    const items = await Promise.all(purchases.map(async (p) => {
      const Model = p.itemType === 'book' ? Book : Exam;
      const resource = await Model.findByPk(p.itemId);
      return {
        purchaseId: p.id,
        itemType: p.itemType,
        itemId: p.itemId,
        accessType: p.accessType,
        expiresAt: p.expiresAt,
        active: p.hasActiveAccess(),
        title: resource ? resource.title : '(unavailable)',
        coverImage: resource ? resource.coverImage : null
      };
    }));

    return res.json({ success: true, items: items.filter((i) => i.active) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not load your library.', error: err.message });
  }
};
