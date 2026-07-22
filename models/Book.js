const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class Book extends Model {}

Book.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  title: { type: DataTypes.STRING, allowNull: false },
  author: { type: DataTypes.STRING, allowNull: true },
  description: { type: DataTypes.TEXT, allowNull: true },
  price: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  rentPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
  rentDurationDays: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 30 },
  coverImage: { type: DataTypes.STRING, allowNull: true },
  fileUrl: { type: DataTypes.STRING, allowNull: false }, // private path, not served publicly
  // If the uploaded file wasn't already a PDF, we auto-convert it to one (see
  // services/conversionService.js) so every resource can go through the same
  // protected, canvas-based reader. This tracks that conversion's outcome.
  conversionStatus: { type: DataTypes.ENUM('not_needed', 'converted', 'failed', 'pending'), defaultValue: 'not_needed' },
  categoryId: { type: DataTypes.INTEGER, allowNull: false },
  uploadedBy: { type: DataTypes.INTEGER, allowNull: false },
  isPublished: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  sequelize,
  modelName: 'Book',
  indexes: [
    { fields: ['category_id'] },
    { fields: ['is_published'] },
    { fields: ['created_at'] }
  ]
});

module.exports = Book;
