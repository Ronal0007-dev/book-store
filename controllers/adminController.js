const { sequelize, Book, Exam, Category, User, Order, Payment } = require('../models');

// Dashboard summary: counts of books/exams/categories/users + payment totals.
exports.dashboardStats = async (req, res) => {
  try {
    const [bookCount, examCount, categoryCount, userCount, orderCount] = await Promise.all([
      Book.count(),
      Exam.count(),
      Category.count(),
      User.count({ where: { role: 'user' } }),
      Order.count({ where: { status: 'paid' } })
    ]);

    const revenue = await Order.sum('totalAmount', { where: { status: 'paid' } });

    const recentPayments = await Payment.findAll({
      order: [['createdAt', 'DESC']],
      limit: 10,
      include: [{ model: User, attributes: ['id', 'name', 'email'] }]
    });

    return res.json({
      success: true,
      stats: {
        bookCount,
        examCount,
        categoryCount,
        userCount,
        paidOrderCount: orderCount,
        totalRevenue: revenue || 0
      },
      recentPayments
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not load dashboard stats.', error: err.message });
  }
};

// All transactions, with basic filtering, for the admin transactions page.
exports.listTransactions = async (req, res) => {
  try {
    const { status, provider } = req.query;
    const where = {};
    if (status) where.status = status;
    if (provider) where.provider = provider;

    const payments = await Payment.findAll({
      where,
      order: [['createdAt', 'DESC']],
      include: [
        { model: User, attributes: ['id', 'name', 'email'] },
        { model: Order, attributes: ['id', 'orderNumber', 'totalAmount', 'status'] }
      ]
    });

    return res.json({ success: true, payments });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not load transactions.', error: err.message });
  }
};

exports.listUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'name', 'email', 'phone', 'role', 'isActive', 'createdAt'],
      order: [['createdAt', 'DESC']]
    });
    return res.json({ success: true, users });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not load users.', error: err.message });
  }
};

exports.toggleUserActive = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.role === 'admin') return res.status(400).json({ success: false, message: 'Cannot deactivate an admin account.' });
    await user.update({ isActive: !user.isActive });
    return res.json({ success: true, user: { id: user.id, isActive: user.isActive } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not update user.', error: err.message });
  }
};

// --- Full resource management for admin (sees unpublished items too) ---

exports.listAllBooks = async (req, res) => {
  try {
    const { q } = req.query;
    const where = {};
    if (q) {
      const { Op } = require('sequelize');
      where.title = { [Op.like]: `%${q}%` };
    }
    const books = await Book.findAll({ where, include: [{ model: Category, attributes: ['id', 'name'] }], order: [['createdAt', 'DESC']] });
    return res.json({ success: true, books });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not load books.', error: err.message });
  }
};

exports.getBookById = async (req, res) => {
  try {
    const book = await Book.findByPk(req.params.id, { include: [{ model: Category, attributes: ['id', 'name'] }] });
    if (!book) return res.status(404).json({ success: false, message: 'Book not found.' });
    return res.json({ success: true, book });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not load book.', error: err.message });
  }
};

exports.listAllExams = async (req, res) => {
  try {
    const { q } = req.query;
    const where = {};
    if (q) {
      const { Op } = require('sequelize');
      where.title = { [Op.like]: `%${q}%` };
    }
    const exams = await Exam.findAll({ where, include: [{ model: Category, attributes: ['id', 'name'] }], order: [['createdAt', 'DESC']] });
    return res.json({ success: true, exams });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not load exams.', error: err.message });
  }
};

exports.getExamById = async (req, res) => {
  try {
    const exam = await Exam.findByPk(req.params.id, { include: [{ model: Category, attributes: ['id', 'name'] }] });
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });
    return res.json({ success: true, exam });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not load exam.', error: err.message });
  }
};

// --- Transaction management ---

// Admin can manually correct a payment's status (e.g. reconciling a provider
// callback that never arrived). Setting it to "success" also finalizes the
// order and grants access, exactly like a normal successful webhook would.
exports.updateTransactionStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['initiated', 'pending', 'success', 'failed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }

    const payment = await Payment.findByPk(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Transaction not found.' });

    await payment.update({ status, failureReason: status === 'failed' ? (req.body.failureReason || 'Marked failed by admin') : null });

    if (status === 'success') {
      const paymentController = require('./paymentController');
      await paymentController.finalizePaidOrder(payment);
    }

    return res.json({ success: true, payment });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not update transaction.', error: err.message });
  }
};

exports.deleteTransaction = async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Transaction not found.' });
    await payment.destroy();
    return res.json({ success: true, message: 'Transaction deleted.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not delete transaction.', error: err.message });
  }
};
