const router = require('express').Router();

router.use('/auth', require('./auth'));
router.use('/categories', require('./categories'));
router.use('/books', require('./books'));
router.use('/exams', require('./exams'));
router.use('/cart', require('./cart'));
router.use('/orders', require('./orders'));
router.use('/payments', require('./payments'));
router.use('/library', require('./library'));
router.use('/admin', require('./admin'));

module.exports = router;
