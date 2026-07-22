const router = require('express').Router();
const categoryController = require('../../controllers/categoryController');
const { authenticate, requireAdmin } = require('../../middleware/auth');

router.get('/', categoryController.listCategories); // public
router.post('/', authenticate, requireAdmin, categoryController.createCategory);
router.put('/:id', authenticate, requireAdmin, categoryController.updateCategory);
router.delete('/:id', authenticate, requireAdmin, categoryController.deleteCategory);

module.exports = router;
