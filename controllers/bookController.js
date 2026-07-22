const path = require('path');
const fs = require('fs');
const { Book, Category, Purchase } = require('../models');
const { getPagination, buildMeta } = require('../utils/paginate');
const { convertToPdfIfNeeded } = require('../services/conversionService');

const PUBLIC_ATTRS = ['id', 'title', 'author', 'description', 'price', 'rentPrice', 'rentDurationDays', 'coverImage', 'categoryId', 'createdAt'];

// Public: browse all books (metadata + price only, never the file). Paginated
// (default 10/page) so the catalog stays fast even with 10,000+ books.
exports.listBooks = async (req, res) => {
  try {
    const { categoryId, q } = req.query;
    const where = { isPublished: true };
    if (categoryId) where.categoryId = categoryId;

    const { Op } = require('sequelize');
    if (q) where.title = { [Op.like]: `%${q}%` };

    const pagination = getPagination(req.query);
    const { count, rows } = await Book.findAndCountAll({
      where,
      attributes: PUBLIC_ATTRS,
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

// Feeds the protected in-browser reader (views/reader.pug). Same access check
// as downloadBook, but served *inline* with no-store caching so the browser
// doesn't offer a "Save As" prompt or write it to disk cache. The reader then
// renders it page-by-page onto <canvas> instead of showing a native PDF
// viewer, so there's no built-in download/print button to begin with.
// NOTE: this only stops casual copying via the UI - a technically determined
// user can still capture the network response. See README for the honest
// limits of what any browser-based protection can guarantee.
exports.streamBook = async (req, res) => {
  try {
    const book = await Book.findByPk(req.params.id);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found.' });
    if (path.extname(book.fileUrl).toLowerCase() !== '.pdf') {
      return res.status(422).json({ success: false, message: 'This resource has not been converted to PDF yet and cannot be streamed to the protected reader.' });
    }

    const purchase = await Purchase.findOne({ where: { userId: req.user.id, itemType: 'book', itemId: book.id } });
    if (!purchase || !purchase.hasActiveAccess()) {
      return res.status(403).json({ success: false, message: 'You have not purchased or rented this book, or your rental has expired.' });
    }

    const filePath = path.resolve(book.fileUrl);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File is unavailable. Contact support.' });
    }

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Content-Type-Options': 'nosniff'
    });
    return fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not load book.', error: err.message });
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

    // Convert to PDF if needed so the resource can go through the protected
    // reader (which only knows how to render PDFs). Original file is kept as
    // fallback if conversion fails (e.g. LibreOffice not installed).
    const uploadedPath = req.files.resource[0].path;
    const conversion = await convertToPdfIfNeeded(uploadedPath);
    const fileUrl = conversion.status === 'converted' ? conversion.outputPath : uploadedPath;

    const book = await Book.create({
      title,
      author,
      description,
      price,
      rentPrice: rentPrice || null,
      rentDurationDays: rentDurationDays || 30,
      categoryId,
      uploadedBy: req.user.id,
      fileUrl,
      conversionStatus: conversion.status,
      coverImage: req.files.cover ? `/uploads/covers/${path.basename(req.files.cover[0].path)}` : null
    });

    const response = { success: true, book };
    if (conversion.status === 'failed') {
      response.warning = `Uploaded, but could not auto-convert to PDF for the protected reader: ${conversion.error} The file was saved as-is; consider uploading a PDF directly.`;
    }
    return res.status(201).json(response);
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

    if (req.files && req.files.resource) {
      const uploadedPath = req.files.resource[0].path;
      const conversion = await convertToPdfIfNeeded(uploadedPath);
      fields.fileUrl = conversion.status === 'converted' ? conversion.outputPath : uploadedPath;
      fields.conversionStatus = conversion.status;
    }
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
