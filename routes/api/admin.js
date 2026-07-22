const router = require('express').Router();
const adminController = require('../../controllers/adminController');
const { authenticate, requireAdmin, requireSuperAdmin } = require('../../middleware/auth');

router.use(authenticate, requireAdmin);

router.get('/stats', adminController.dashboardStats);

router.get('/books', adminController.listAllBooks);
router.get('/books/:id', adminController.getBookById);
router.get('/exams', adminController.listAllExams);
router.get('/exams/:id', adminController.getExamById);

router.get('/transactions', adminController.listTransactions);
router.patch('/transactions/:id', adminController.updateTransactionStatus);
router.delete('/transactions/:id', adminController.deleteTransaction);

router.get('/users', adminController.listUsers);
router.patch('/users/:id/toggle-active', adminController.toggleUserActive);

// Super admin only: create staff admin accounts and promote/demote users.
router.post('/admins', requireSuperAdmin, adminController.createAdmin);
router.patch('/users/:id/role', requireSuperAdmin, adminController.setUserRole);

module.exports = router;
