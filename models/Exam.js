const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class Exam extends Model {}

Exam.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  title: { type: DataTypes.STRING, allowNull: false },
  subject: { type: DataTypes.STRING, allowNull: true },
  yearSeries: { type: DataTypes.STRING, allowNull: false }, // e.g. "2023", "2019-2023"
  description: { type: DataTypes.TEXT, allowNull: true },
  price: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  rentPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
  rentDurationDays: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 30 },
  coverImage: { type: DataTypes.STRING, allowNull: true },
  fileUrl: { type: DataTypes.STRING, allowNull: false },
  categoryId: { type: DataTypes.INTEGER, allowNull: false },
  uploadedBy: { type: DataTypes.INTEGER, allowNull: false },
  isPublished: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  sequelize,
  modelName: 'Exam'
});

module.exports = Exam;
