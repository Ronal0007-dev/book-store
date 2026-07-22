const router = require('express').Router();
const cartController = require('../../controllers/cartController');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate); // every cart route requires login

router.get('/', cartController.getCart);
router.post('/', cartController.addToCart);
router.delete('/:itemId', cartController.removeFromCart);
router.delete('/', cartController.clearCart);

module.exports = router;
