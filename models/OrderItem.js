const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class OrderItem extends Model {}

OrderItem.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  itemType: { type: DataTypes.ENUM('book', 'exam'), allowNull: false },
  itemId: { type: DataTypes.INTEGER, allowNull: false },
  accessType: { type: DataTypes.ENUM('buy', 'rent'), allowNull: false, defaultValue: 'buy' },
  unitPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  lineTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false }
}, {
  sequelize,
  modelName: 'OrderItem'
});

module.exports = OrderItem;
