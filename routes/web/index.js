const router = require('express').Router();
const { Category, Book, Exam, Purchase } = require('../../models');
const { optionalAuthenticate, authenticateWeb, requireAdminWeb } = require('../../middleware/auth');
const { getPagination, buildMeta } = require('../../utils/paginate');

// Every server-rendered page gets the current exam categories available so the
// layout can render a dynamic level/category strip (admin-created, not hardcoded).
router.use(async (req, res, next) => {
  try {
    res.locals.navExamCategories = await Category.findAll({ where: { type: 'exam' }, order: [['name', 'ASC']], limit: 8 });
  } catch (err) {
    res.locals.navExamCategories = [];
  }
  next();
});

// --- Public landing page: shows all categories + a sample of books/exams ---
router.get('/search', optionalAuthenticate, async (req, res) => {
  const { Op } = require('sequelize');
  const q = req.query.q || '';
  const where = q ? { title: { [Op.like]: `%${q}%` }, isPublished: true } : { isPublished: true };
  const [books, exams] = await Promise.all([
    Book.findAll({ where, include: [Category], limit: 20 }),
    Exam.findAll({ where, include: [Category], limit: 20 })
  ]);
  res.render('search', { user: req.user || null, q, books, exams });
});

router.get('/', optionalAuthenticate, async (req, res) => {
  const bookCategories = await Category.findAll({ where: { type: 'book' }, order: [['name', 'ASC']] });
  const examCategories = await Category.findAll({ where: { type: 'exam' }, order: [['name', 'ASC']] });
  const latestBooks = await Book.findAll({ where: { isPublished: true }, limit: 8, order: [['createdAt', 'DESC']], include: [Category] });
  const latestExams = await Exam.findAll({ where: { isPublished: true }, limit: 8, order: [['createdAt', 'DESC']], include: [Category] });

  res.render('index', {
    user: req.user || null,
    bookCategories,
    examCategories,
    latestBooks,
    latestExams
  });
});

router.get('/login', optionalAuthenticate, (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('login', { user: null, googleClientId: process.env.GOOGLE_CLIENT_ID || null });
});

router.get('/register', optionalAuthenticate, (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('register', { user: null, googleClientId: process.env.GOOGLE_CLIENT_ID || null });
});

router.get('/forgot-password', optionalAuthenticate, (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('forgot-password', { user: null });
});

router.get('/reset-password', optionalAuthenticate, (req, res) => {
  if (req.user) return res.redirect('/');
  const { token, email } = req.query;
  res.render('reset-password', { user: null, token: token || '', email: email || '' });
});

// --- Browse (public metadata), paginated 10/page so 10,000+ resources stay fast ---
router.get('/books', optionalAuthenticate, async (req, res) => {
  const categories = await Category.findAll({ where: { type: 'book' } });
  const where = { isPublished: true };
  if (req.query.categoryId) where.categoryId = req.query.categoryId;

  const pagination = getPagination(req.query);
  const { count, rows: books } = await Book.findAndCountAll({
    where, include: [Category], order: [['createdAt', 'DESC']],
    limit: pagination.limit, offset: pagination.offset, distinct: true
  });

  res.render('books', {
    user: req.user || null, books, categories,
    selectedCategory: req.query.categoryId || '',
    pageMeta: buildMeta(pagination, count)
  });
});

router.get('/exams', optionalAuthenticate, async (req, res) => {
  const categories = await Category.findAll({ where: { type: 'exam' } });
  const where = { isPublished: true };
  if (req.query.categoryId) where.categoryId = req.query.categoryId;

  const pagination = getPagination(req.query);
  const { count, rows: exams } = await Exam.findAndCountAll({
    where, include: [Category], order: [['createdAt', 'DESC']],
    limit: pagination.limit, offset: pagination.offset, distinct: true
  });

  res.render('exams', {
    user: req.user || null, exams, categories,
    selectedCategory: req.query.categoryId || '',
    pageMeta: buildMeta(pagination, count)
  });
});

// --- Individual resource pages: registration/login required to view ---
router.get('/books/:id', authenticateWeb, async (req, res) => {
  const book = await Book.findOne({ where: { id: req.params.id, isPublished: true }, include: [Category] });
  if (!book) return res.status(404).render('404', { user: req.user });
  const purchase = await Purchase.findOne({ where: { userId: req.user.id, itemType: 'book', itemId: book.id } });
  const owned = purchase ? purchase.hasActiveAccess() : false;
  res.render('book-detail', { user: req.user, book, owned });
});

router.get('/exams/:id', authenticateWeb, async (req, res) => {
  const exam = await Exam.findOne({ where: { id: req.params.id, isPublished: true }, include: [Category] });
  if (!exam) return res.status(404).render('404', { user: req.user });
  const purchase = await Purchase.findOne({ where: { userId: req.user.id, itemType: 'exam', itemId: exam.id } });
  const owned = purchase ? purchase.hasActiveAccess() : false;
  res.render('exam-detail', { user: req.user, exam, owned });
});

// --- Protected in-browser reader: only reachable if the user actually owns the resource ---
router.get('/books/:id/read', authenticateWeb, async (req, res) => {
  const book = await Book.findByPk(req.params.id);
  if (!book) return res.status(404).render('404', { user: req.user });
  const purchase = await Purchase.findOne({ where: { userId: req.user.id, itemType: 'book', itemId: book.id } });
  if (!purchase || !purchase.hasActiveAccess()) return res.status(403).render('403', { user: req.user });
  res.render('reader', { user: req.user, title: book.title, streamUrl: `/api/books/${book.id}/stream` });
});

router.get('/exams/:id/read', authenticateWeb, async (req, res) => {
  const exam = await Exam.findByPk(req.params.id);
  if (!exam) return res.status(404).render('404', { user: req.user });
  const purchase = await Purchase.findOne({ where: { userId: req.user.id, itemType: 'exam', itemId: exam.id } });
  if (!purchase || !purchase.hasActiveAccess()) return res.status(403).render('403', { user: req.user });
  res.render('reader', { user: req.user, title: exam.title, streamUrl: `/api/exams/${exam.id}/stream` });
});

router.get('/cart', authenticateWeb, (req, res) => {
  res.render('cart', { user: req.user });
});

router.get('/checkout', authenticateWeb, (req, res) => {
  res.render('checkout', { user: req.user, orderId: req.query.orderId || null });
});

router.get('/library', authenticateWeb, (req, res) => {
  res.render('library', { user: req.user });
});

// --- Admin panel (separate sidebar layout, own nav; data loaded client-side from /api/admin/*) ---
router.get('/admin', authenticateWeb, requireAdminWeb, (req, res) => {
  res.render('admin/dashboard', { user: req.user, title: 'Dashboard', active: 'dashboard' });
});

router.get('/admin/categories', authenticateWeb, requireAdminWeb, (req, res) => {
  res.render('admin/categories', { user: req.user, title: 'Categories', active: 'categories' });
});

router.get('/admin/books', authenticateWeb, requireAdminWeb, (req, res) => {
  res.render('admin/books', { user: req.user, title: 'Books', active: 'books' });
});

router.get('/admin/books/new', authenticateWeb, requireAdminWeb, async (req, res) => {
  const categories = await Category.findAll({ where: { type: 'book' } });
  res.render('admin/upload-book', { user: req.user, categories, title: 'Upload Book', active: 'books' });
});

router.get('/admin/books/:id/edit', authenticateWeb, requireAdminWeb, async (req, res) => {
  const categories = await Category.findAll({ where: { type: 'book' } });
  const book = await Book.findByPk(req.params.id);
  if (!book) return res.status(404).render('404', { user: req.user });
  res.render('admin/edit-book', { user: req.user, categories, bookId: book.id, title: 'Edit Book', active: 'books' });
});

router.get('/admin/exams', authenticateWeb, requireAdminWeb, (req, res) => {
  res.render('admin/exams', { user: req.user, title: 'Past Papers', active: 'exams' });
});

router.get('/admin/exams/new', authenticateWeb, requireAdminWeb, async (req, res) => {
  const categories = await Category.findAll({ where: { type: 'exam' } });
  res.render('admin/upload-exam', { user: req.user, categories, title: 'Upload Exam', active: 'exams' });
});

router.get('/admin/exams/:id/edit', authenticateWeb, requireAdminWeb, async (req, res) => {
  const categories = await Category.findAll({ where: { type: 'exam' } });
  const exam = await Exam.findByPk(req.params.id);
  if (!exam) return res.status(404).render('404', { user: req.user });
  res.render('admin/edit-exam', { user: req.user, categories, examId: exam.id, title: 'Edit Exam', active: 'exams' });
});

router.get('/admin/transactions', authenticateWeb, requireAdminWeb, (req, res) => {
  res.render('admin/transactions', { user: req.user, title: 'Transactions', active: 'transactions' });
});

router.get('/admin/users', authenticateWeb, requireAdminWeb, (req, res) => {
  res.render('admin/users', { user: req.user, title: 'Users', active: 'users', isSuperAdmin: req.user.isSuperAdmin() });
});

module.exports = router;
