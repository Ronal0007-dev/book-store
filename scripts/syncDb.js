require('dotenv').config();
const { sequelize, User } = require('../models');

// One-off script: `npm run db:sync` — syncs tables and creates a default
// admin account (change the password immediately after first login).
(async () => {
  try {
    await sequelize.sync({ alter: true });
    console.log('Tables synced.');

    const existingAdmin = await User.findOne({ where: { role: 'admin' } });
    if (!existingAdmin) {
      await User.create({
        name: 'Administrator',
        email: 'admin@example.com',
        phone: '255700000000',
        password: 'ChangeMe123!',
        role: 'admin'
      });
      console.log('Default admin created: admin@example.com / ChangeMe123! (change this immediately)');
    } else {
      console.log('An admin account already exists, skipping.');
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
