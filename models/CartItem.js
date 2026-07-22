const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class CartItem extends Model {}

CartItem.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  cartId: { type: DataTypes.INTEGER, allowNull: false },
  itemType: { type: DataTypes.ENUM('book', 'exam'), allowNull: false },
  itemId: { type: DataTypes.INTEGER, allowNull: false },
  accessType: { type: DataTypes.ENUM('buy', 'rent'), allowNull: false, defaultValue: 'buy' },
  unitPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }
}, {
  sequelize,
  modelName: 'CartItem',
  indexes: [{ unique: true, fields: ['cart_id', 'item_type', 'item_id', 'access_type'] }]
});

module.exports = CartItem;
