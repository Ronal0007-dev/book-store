const sequelize = require('../config/database');
const User = require('./User');
const Category = require('./Category');
const Book = require('./Book');
const Exam = require('./Exam');
const Cart = require('./Cart');
const CartItem = require('./CartItem');
const Order = require('./Order');
const OrderItem = require('./OrderItem');
const Payment = require('./Payment');
const Purchase = require('./Purchase');

// --- Associations ---
Category.hasMany(Book, { foreignKey: 'categoryId', onDelete: 'RESTRICT' });
Book.belongsTo(Category, { foreignKey: 'categoryId' });

Category.hasMany(Exam, { foreignKey: 'categoryId', onDelete: 'RESTRICT' });
Exam.belongsTo(Category, { foreignKey: 'categoryId' });

User.hasOne(Cart, { foreignKey: 'userId', onDelete: 'CASCADE' });
Cart.belongsTo(User, { foreignKey: 'userId' });

Cart.hasMany(CartItem, { foreignKey: 'cartId', onDelete: 'CASCADE' });
CartItem.belongsTo(Cart, { foreignKey: 'cartId' });

User.hasMany(Order, { foreignKey: 'userId' });
Order.belongsTo(User, { foreignKey: 'userId' });

Order.hasMany(OrderItem, { foreignKey: 'orderId', onDelete: 'CASCADE' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId' });

Order.hasMany(Payment, { foreignKey: 'orderId' });
Payment.belongsTo(Order, { foreignKey: 'orderId' });

User.hasMany(Payment, { foreignKey: 'userId' });
Payment.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Purchase, { foreignKey: 'userId' });
Purchase.belongsTo(User, { foreignKey: 'userId' });

Order.hasMany(Purchase, { foreignKey: 'orderId' });
Purchase.belongsTo(Order, { foreignKey: 'orderId' });

module.exports = {
  sequelize,
  User,
  Category,
  Book,
  Exam,
  Cart,
  CartItem,
  Order,
  OrderItem,
  Payment,
  Purchase
};
