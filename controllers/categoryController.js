const { Category, Book, Exam, sequelize } = require('../models');

// Public: list categories, optionally filtered by type=book|exam, with resource counts.
exports.listCategories = async (req, res) => {
  try {
    const { type } = req.query;
    const where = type ? { type } : {};

    const categories = await Category.findAll({
      where,
      attributes: {
        include: [
          [
            sequelize.literal(`(
              SELECT COUNT(*) FROM books AS b
              WHERE b.category_id = Category.id AND b.is_published = true
            )`),
            'bookCount'
          ],
          [
            sequelize.literal(`(
              SELECT COUNT(*) FROM exams AS e
              WHERE e.category_id = Category.id AND e.is_published = true
            )`),
            'examCount'
          ]
        ]
      },
      order: [['name', 'ASC']]
    });

    return res.json({ success: true, categories });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not load categories.', error: err.message });
  }
};

// Admin: create a category
exports.createCategory = async (req, res) => {
  try {
    const { name, type, description } = req.body;
    if (!name || !['book', 'exam'].includes(type)) {
      return res.status(400).json({ success: false, message: 'name and a valid type (book|exam) are required.' });
    }

    const category = await Category.create({ name, type, description, createdBy: req.user.id });
    return res.status(201).json({ success: true, category });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not create category.', error: err.message });
  }
};

// Admin: update / delete
exports.updateCategory = async (req, res) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found.' });
    await category.update(req.body);
    return res.json({ success: true, category });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not update category.', error: err.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found.' });
    await category.destroy();
    return res.json({ success: true, message: 'Category deleted.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not delete category (it may still have resources).', error: err.message });
  }
};
