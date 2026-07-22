const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

// Grants a user access to a specific book/exam (buy = forever, rent = until expiresAt)
class Purchase extends Model {
  hasActiveAccess() {
    if (this.accessType === 'buy') return true;
    if (this.accessType === 'rent') return this.expiresAt && new Date(this.expiresAt) > new Date();
    return false;
  }
}

Purchase.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  itemType: { type: DataTypes.ENUM('book', 'exam'), allowNull: false },
  itemId: { type: DataTypes.INTEGER, allowNull: false },
  accessType: { type: DataTypes.ENUM('buy', 'rent'), allowNull: false },
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  expiresAt: { type: DataTypes.DATE, allowNull: true }
}, {
  sequelize,
  modelName: 'Purchase',
  indexes: [{ unique: true, fields: ['user_id', 'item_type', 'item_id'] }]
});

module.exports = Purchase;
