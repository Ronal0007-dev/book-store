const router = require('express').Router();
const bookController = require('../../controllers/bookController');
const { authenticate, requireAdmin } = require('../../middleware/auth');
const upload = require('../../middleware/upload');

// Public: browse metadata only.
router.get('/', bookController.listBooks);

// Requires login to view an individual book's detail page.
router.get('/:id', authenticate, bookController.getBook);

// Requires login AND an active purchase/rental to actually download the file.
router.get('/:id/download', authenticate, bookController.downloadBook);

// Feeds the protected in-browser reader (canvas-based, no native download UI).
router.get('/:id/stream', authenticate, bookController.streamBook);

// Admin only: manage books.
const resourceUpload = upload.fields([{ name: 'resource', maxCount: 1 }, { name: 'cover', maxCount: 1 }]);
router.post('/', authenticate, requireAdmin, resourceUpload, bookController.createBook);
router.put('/:id', authenticate, requireAdmin, resourceUpload, bookController.updateBook);
router.delete('/:id', authenticate, requireAdmin, bookController.deleteBook);

module.exports = router;
