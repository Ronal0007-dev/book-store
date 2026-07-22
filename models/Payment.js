const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class Payment extends Model {}

Payment.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  provider: { type: DataTypes.ENUM('mpesa', 'mixbyyas'), allowNull: false },
  phone: { type: DataTypes.STRING, allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  currency: { type: DataTypes.STRING, defaultValue: 'TZS' },
  status: { type: DataTypes.ENUM('initiated', 'pending', 'success', 'failed'), defaultValue: 'initiated' },
  providerReference: { type: DataTypes.STRING, allowNull: true }, // conversation/transaction id returned by provider
  providerResponse: { type: DataTypes.TEXT, allowNull: true }, // raw JSON, for auditing
  failureReason: { type: DataTypes.STRING, allowNull: true }
}, {
  sequelize,
  modelName: 'Payment'
});

module.exports = Payment;
