const router = require('express').Router();
const libraryController = require('../../controllers/libraryController');
const { authenticate } = require('../../middleware/auth');

router.get('/', authenticate, libraryController.myLibrary);

module.exports = router;
