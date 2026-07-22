const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

// A category can hold books OR exams (e.g. "Mathematics", "Form Four - NECTA")
class Category extends Model {}

Category.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  type: { type: DataTypes.ENUM('book', 'exam'), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  createdBy: { type: DataTypes.INTEGER, allowNull: true } // admin user id
}, {
  sequelize,
  modelName: 'Category',
  indexes: [{ unique: true, fields: ['name', 'type'] }]
});

module.exports = Category;
