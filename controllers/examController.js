const path = require('path');
const fs = require('fs');
const { Exam, Category, Purchase } = require('../models');
const { getPagination, buildMeta } = require('../utils/paginate');
const { convertToPdfIfNeeded } = require('../services/conversionService');

const PUBLIC_ATTRS = ['id', 'title', 'subject', 'yearSeries', 'description', 'price', 'rentPrice', 'rentDurationDays', 'coverImage', 'categoryId', 'createdAt'];

exports.listExams = async (req, res) => {
  try {
    const { categoryId, q, yearSeries } = req.query;
    const where = { isPublished: true };
    if (categoryId) where.categoryId = categoryId;
    if (yearSeries) where.yearSeries = yearSeries;

    const { Op } = require('sequelize');
    if (q) where.title = { [Op.like]: `%${q}%` };

    const pagination = getPagination(req.query);
    const { count, rows } = await Exam.findAndCountAll({
      where,
      attributes: PUBLIC_ATTRS,
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

exports.getExam = async (req, res) => {
  try {
    const exam = await Exam.findOne({
      where: { id: req.params.id, isPublished: true },
      attributes: PUBLIC_ATTRS,
      include: [{ model: Category, attributes: ['id', 'name'] }]
    });
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });

    const purchase = await Purchase.findOne({ where: { userId: req.user.id, itemType: 'exam', itemId: exam.id } });
    const owned = purchase ? purchase.hasActiveAccess() : false;

    return res.json({ success: true, exam, owned });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not load exam.', error: err.message });
  }
};

exports.downloadExam = async (req, res) => {
  try {
    const exam = await Exam.findByPk(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });

    const purchase = await Purchase.findOne({ where: { userId: req.user.id, itemType: 'exam', itemId: exam.id } });
    if (!purchase || !purchase.hasActiveAccess()) {
      return res.status(403).json({ success: false, message: 'You have not purchased or rented this exam, or your rental has expired.' });
    }

    const filePath = path.resolve(exam.fileUrl);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File is unavailable. Contact support.' });
    }
    return res.download(filePath, `${exam.title}${path.extname(filePath)}`);
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not download exam.', error: err.message });
  }
};

// See bookController.streamBook for the full explanation - same protected,
// inline-only streaming used by the canvas-based reader for exams.
exports.streamExam = async (req, res) => {
  try {
    const exam = await Exam.findByPk(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });
    if (path.extname(exam.fileUrl).toLowerCase() !== '.pdf') {
      return res.status(422).json({ success: false, message: 'This resource has not been converted to PDF yet and cannot be streamed to the protected reader.' });
    }

    const purchase = await Purchase.findOne({ where: { userId: req.user.id, itemType: 'exam', itemId: exam.id } });
    if (!purchase || !purchase.hasActiveAccess()) {
      return res.status(403).json({ success: false, message: 'You have not purchased or rented this exam, or your rental has expired.' });
    }

    const filePath = path.resolve(exam.fileUrl);
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
    return res.status(500).json({ success: false, message: 'Could not load exam.', error: err.message });
  }
};

exports.createExam = async (req, res) => {
  try {
    const { title, subject, yearSeries, description, price, rentPrice, rentDurationDays, categoryId } = req.body;

    if (!req.files || !req.files.resource) {
      return res.status(400).json({ success: false, message: 'A resource file (PDF/EPUB/DOCX) is required.' });
    }

    const category = await Category.findOne({ where: { id: categoryId, type: 'exam' } });
    if (!category) return res.status(400).json({ success: false, message: 'Invalid exam category. Create it first.' });

    const uploadedPath = req.files.resource[0].path;
    const conversion = await convertToPdfIfNeeded(uploadedPath);
    const fileUrl = conversion.status === 'converted' ? conversion.outputPath : uploadedPath;

    const exam = await Exam.create({
      title,
      subject,
      yearSeries,
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

    const response = { success: true, exam };
    if (conversion.status === 'failed') {
      response.warning = `Uploaded, but could not auto-convert to PDF for the protected reader: ${conversion.error} The file was saved as-is; consider uploading a PDF directly.`;
    }
    return res.status(201).json(response);
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not create exam.', error: err.message });
  }
};

exports.updateExam = async (req, res) => {
  try {
    const exam = await Exam.findByPk(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });

    const fields = (({ title, subject, yearSeries, description, price, rentPrice, rentDurationDays, categoryId, isPublished }) =>
      ({ title, subject, yearSeries, description, price, rentPrice, rentDurationDays, categoryId, isPublished }))(req.body);

    Object.keys(fields).forEach((k) => { if (typeof fields[k] === 'undefined') delete fields[k]; });
    if (typeof fields.isPublished !== 'undefined') fields.isPublished = fields.isPublished === true || fields.isPublished === 'true';

    if (req.files && req.files.resource) {
      const uploadedPath = req.files.resource[0].path;
      const conversion = await convertToPdfIfNeeded(uploadedPath);
      fields.fileUrl = conversion.status === 'converted' ? conversion.outputPath : uploadedPath;
      fields.conversionStatus = conversion.status;
    }
    if (req.files && req.files.cover) fields.coverImage = `/uploads/covers/${path.basename(req.files.cover[0].path)}`;

    await exam.update(fields);
    return res.json({ success: true, exam });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not update exam.', error: err.message });
  }
};

exports.deleteExam = async (req, res) => {
  try {
    const exam = await Exam.findByPk(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });
    await exam.destroy();
    return res.json({ success: true, message: 'Exam deleted.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not delete exam.', error: err.message });
  }
};
