const { sequelize, Book, Exam, Category, User, Order, Payment } = require('../models');
const { getPagination, buildMeta } = require('../utils/paginate');

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

// All transactions, with basic filtering, for the admin transactions page. Paginated.
exports.listTransactions = async (req, res) => {
  try {
    const { status, provider, q } = req.query;
    const where = {};
    if (status) where.status = status;
    if (provider) where.provider = provider;

    const { Op } = require('sequelize');
    const userInclude = { model: User, attributes: ['id', 'name', 'email'] };
    const orderInclude = { model: Order, attributes: ['id', 'orderNumber', 'totalAmount', 'status'] };

    if (q) {
      // Search across the associated user's name/email or the order number.
      where[Op.or] = [
        { '$User.name$': { [Op.like]: `%${q}%` } },
        { '$User.email$': { [Op.like]: `%${q}%` } },
        { '$Order.order_number$': { [Op.like]: `%${q}%` } }
      ];
    }

    const pagination = getPagination(req.query);
    const { count, rows } = await Payment.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      include: [userInclude, orderInclude],
      limit: pagination.limit,
      offset: pagination.offset,
      subQuery: false, // required so LIMIT/OFFSET work correctly alongside the $association.field$ where clause
      distinct: true
    });

    return res.json({ success: true, payments: rows, pagination: buildMeta(pagination, count) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not load transactions.', error: err.message });
  }
};

// Paginated user list (handles 5,000+ users without loading them all at once).
exports.listUsers = async (req, res) => {
  try {
    const { q, role } = req.query;
    const where = {};
    if (role) where.role = role;
    if (q) {
      const { Op } = require('sequelize');
      where[Op.or] = [{ name: { [Op.like]: `%${q}%` } }, { email: { [Op.like]: `%${q}%` } }];
    }

    const pagination = getPagination(req.query);
    const { count, rows } = await User.findAndCountAll({
      where,
      attributes: ['id', 'name', 'email', 'phone', 'role', 'authProvider', 'isActive', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: pagination.limit,
      offset: pagination.offset
    });

    return res.json({ success: true, users: rows, pagination: buildMeta(pagination, count) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not load users.', error: err.message });
  }
};

exports.toggleUserActive = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.isAdminOrAbove()) return res.status(400).json({ success: false, message: 'Cannot deactivate an admin account.' });
    await user.update({ isActive: !user.isActive });
    return res.json({ success: true, user: { id: user.id, isActive: user.isActive } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not update user.', error: err.message });
  }
};

// --- Super admin only: manage admin accounts ---

// Creates a brand-new staff admin account. Only a superadmin can do this.
exports.createAdmin = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Name, email, and a password (6+ chars) are required.' });
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ success: false, message: 'A user with this email already exists.' });

    const admin = await User.create({ name, email, phone, password, role: 'admin', authProvider: 'local' });
    return res.status(201).json({ success: true, user: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not create admin.', error: err.message });
  }
};

// Promotes an existing regular user to admin, or demotes an admin back to a
// regular user. Only a superadmin can do this; superadmin status itself can't
// be changed here (there's exactly one, seeded at setup).
exports.setUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'role must be "user" or "admin".' });
    }
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.role === 'superadmin') {
      return res.status(400).json({ success: false, message: 'The super admin role cannot be changed.' });
    }
    await user.update({ role });
    return res.json({ success: true, user: { id: user.id, role: user.role } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not update role.', error: err.message });
  }
};

// --- Full resource management for admin (sees unpublished items too). Paginated. ---

exports.listAllBooks = async (req, res) => {
  try {
    const { q } = req.query;
    const where = {};
    if (q) {
      const { Op } = require('sequelize');
      where.title = { [Op.like]: `%${q}%` };
    }
    const pagination = getPagination(req.query);
    const { count, rows } = await Book.findAndCountAll({
      where,
      include: [{ model: Category, attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']],
      limit: pagination.limit,
      offset: pagination.offset,
      distinct: true
    });
    return res.json({ success: true, books: rows, pagination: buildMeta(pagination, count) });
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
    const pagination = getPagination(req.query);
    const { count, rows } = await Exam.findAndCountAll({
      where,
      include: [{ model: Category, attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']],
      limit: pagination.limit,
      offset: pagination.offset,
      distinct: true
    });
    return res.json({ success: true, exams: rows, pagination: buildMeta(pagination, count) });
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
