require('dotenv').config();
const { sequelize, User } = require('../models');

// One-off script: `npm run db:sync` — syncs tables and creates the default
// SUPER admin account (change the password immediately after first login).
// The super admin is the only account that can create/promote other admins.
(async () => {
  try {
    await sequelize.sync({ alter: true });
    console.log('Tables synced.');

    const existingSuperAdmin = await User.findOne({ where: { role: 'superadmin' } });
    if (!existingSuperAdmin) {
      await User.create({
        name: 'Super Admin',
        email: 'admin@example.com',
        phone: '255700000000',
        password: 'ChangeMe123!',
        role: 'superadmin',
        authProvider: 'local'
      });
      console.log('Default SUPER ADMIN created: admin@example.com / ChangeMe123! (change this immediately)');
      console.log('Sign in with this account, then use Admin -> Users to create additional admin accounts.');
    } else {
      console.log('A super admin account already exists, skipping.');
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
