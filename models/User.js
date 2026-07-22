const { DataTypes, Model } = require('sequelize');
const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');

class User extends Model {
  async validPassword(plain) {
    if (!this.password) return false; // Google-only account has no local password
    return bcrypt.compare(plain, this.password);
  }

  isSuperAdmin() {
    return this.role === 'superadmin';
  }

  isAdminOrAbove() {
    return this.role === 'admin' || this.role === 'superadmin';
  }
}

User.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
  phone: { type: DataTypes.STRING, allowNull: true },
  // Nullable: users who sign up via Google never set a local password.
  password: { type: DataTypes.STRING, allowNull: true },
  authProvider: { type: DataTypes.ENUM('local', 'google'), defaultValue: 'local' },
  googleId: { type: DataTypes.STRING, allowNull: true, unique: true },
  avatarUrl: { type: DataTypes.STRING, allowNull: true },
  // 'superadmin' = the platform owner account (seeded once); can create/manage other admins.
  // 'admin' = staff account created by a superadmin; manages content but not other admins.
  role: { type: DataTypes.ENUM('user', 'admin', 'superadmin'), defaultValue: 'user' },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  // Password reset: we store a HASH of the reset token, never the raw token
  // (the raw token only ever lives in the emailed link), plus its expiry.
  resetPasswordTokenHash: { type: DataTypes.STRING, allowNull: true },
  resetPasswordExpires: { type: DataTypes.DATE, allowNull: true }
}, {
  sequelize,
  modelName: 'User',
  indexes: [
    { fields: ['role'] },
    { fields: ['is_active'] }
  ],
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) user.password = await bcrypt.hash(user.password, 10);
    },
    beforeUpdate: async (user) => {
      if (user.changed('password') && user.password) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    }
  }
});

module.exports = User;
