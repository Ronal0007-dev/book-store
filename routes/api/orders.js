const router = require('express').Router();
const orderController = require('../../controllers/orderController');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.post('/checkout', orderController.checkout); // cart -> pending order with total price
router.get('/', orderController.myOrders);
router.get('/:id', orderController.getOrder);

module.exports = router;
