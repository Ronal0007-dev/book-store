const path = require('path');
const fs = require('fs');
const { Book, Category, Purchase } = require('../models');

const PUBLIC_ATTRS = ['id', 'title', 'author', 'description', 'price', 'rentPrice', 'rentDurationDays', 'coverImage', 'categoryId', 'createdAt'];

// Public: browse all books (metadata + price only, never the file).
exports.listBooks = async (req, res) => {
  try {
    const { categoryId, q } = req.query;
    const where = { isPublished: true };
    if (categoryId) where.categoryId = categoryId;

    const { Op } = require('sequelize');
    if (q) where.title = { [Op.like]: `%${q}%` };

    const books = await Book.findAll({
      where,
      attributes: PUBLIC_ATTRS,
      include: [{ model: Category, attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']]
    });

    return res.json({ success: true, books });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not load books.', error: err.message });
  }
};

// Protected: view a single book's detail page. Requires login (per business rule:
// "client won't be able to view individual book unless registered/logged in").
// The actual downloadable file is still gated separately by ownership (see download()).
exports.getBook = async (req, res) => {
  try {
    const book = await Book.findOne({
      where: { id: req.params.id, isPublished: true },
      attributes: PUBLIC_ATTRS,
      include: [{ model: Category, attributes: ['id', 'name'] }]
    });
    if (!book) return res.status(404).json({ success: false, message: 'Book not found.' });

    const purchase = await Purchase.findOne({ where: { userId: req.user.id, itemType: 'book', itemId: book.id } });
    const owned = purchase ? purchase.hasActiveAccess() : false;

    return res.json({ success: true, book, owned });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not load book.', error: err.message });
  }
};

// Protected + entitlement-checked: stream the actual file, only if the user has paid.
exports.downloadBook = async (req, res) => {
  try {
    const book = await Book.findByPk(req.params.id);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found.' });

    const purchase = await Purchase.findOne({ where: { userId: req.user.id, itemType: 'book', itemId: book.id } });
    if (!purchase || !purchase.hasActiveAccess()) {
      return res.status(403).json({ success: false, message: 'You have not purchased or rented this book, or your rental has expired.' });
    }

    const filePath = path.resolve(book.fileUrl);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File is unavailable. Contact support.' });
    }
    return res.download(filePath, `${book.title}${path.extname(filePath)}`);
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not download book.', error: err.message });
  }
};

// Admin: upload a new book under an existing category (created by admin beforehand).
exports.createBook = async (req, res) => {
  try {
    const { title, author, description, price, rentPrice, rentDurationDays, categoryId } = req.body;

    if (!req.files || !req.files.resource) {
      return res.status(400).json({ success: false, message: 'A resource file (PDF/EPUB/DOCX) is required.' });
    }

    const category = await Category.findOne({ where: { id: categoryId, type: 'book' } });
    if (!category) return res.status(400).json({ success: false, message: 'Invalid book category. Create it first.' });

    const book = await Book.create({
      title,
      author,
      description,
      price,
      rentPrice: rentPrice || null,
      rentDurationDays: rentDurationDays || 30,
      categoryId,
      uploadedBy: req.user.id,
      fileUrl: req.files.resource[0].path,
      coverImage: req.files.cover ? `/uploads/covers/${path.basename(req.files.cover[0].path)}` : null
    });

    return res.status(201).json({ success: true, book });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not create book.', error: err.message });
  }
};

exports.updateBook = async (req, res) => {
  try {
    const book = await Book.findByPk(req.params.id);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found.' });

    const fields = (({ title, author, description, price, rentPrice, rentDurationDays, categoryId, isPublished }) =>
      ({ title, author, description, price, rentPrice, rentDurationDays, categoryId, isPublished }))(req.body);

    Object.keys(fields).forEach((k) => { if (typeof fields[k] === 'undefined') delete fields[k]; });
    if (typeof fields.isPublished !== 'undefined') fields.isPublished = fields.isPublished === true || fields.isPublished === 'true';

    if (req.files && req.files.resource) fields.fileUrl = req.files.resource[0].path;
    if (req.files && req.files.cover) fields.coverImage = `/uploads/covers/${path.basename(req.files.cover[0].path)}`;

    await book.update(fields);
    return res.json({ success: true, book });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not update book.', error: err.message });
  }
};

exports.deleteBook = async (req, res) => {
  try {
    const book = await Book.findByPk(req.params.id);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found.' });
    await book.destroy();
    return res.json({ success: true, message: 'Book deleted.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not delete book.', error: err.message });
  }
};
