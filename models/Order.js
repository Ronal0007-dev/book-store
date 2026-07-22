const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class Order extends Model {}

Order.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  orderNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  totalAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'paid', 'failed', 'cancelled'), defaultValue: 'pending' },
  paymentProvider: { type: DataTypes.ENUM('mpesa', 'mixbyyas'), allowNull: true },
  paidAt: { type: DataTypes.DATE, allowNull: true }
}, {
  sequelize,
  modelName: 'Order'
});

module.exports = Order;
