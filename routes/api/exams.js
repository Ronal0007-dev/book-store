const router = require('express').Router();
const examController = require('../../controllers/examController');
const { authenticate, requireAdmin } = require('../../middleware/auth');
const upload = require('../../middleware/upload');

router.get('/', examController.listExams);
router.get('/:id', authenticate, examController.getExam);
router.get('/:id/download', authenticate, examController.downloadExam);
router.get('/:id/stream', authenticate, examController.streamExam);

const resourceUpload = upload.fields([{ name: 'resource', maxCount: 1 }, { name: 'cover', maxCount: 1 }]);
router.post('/', authenticate, requireAdmin, resourceUpload, examController.createExam);
router.put('/:id', authenticate, requireAdmin, resourceUpload, examController.updateExam);
router.delete('/:id', authenticate, requireAdmin, examController.deleteExam);

module.exports = router;
