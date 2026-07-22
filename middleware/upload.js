const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Resource files (the actual PDF/book/exam) are stored OUTSIDE the public web root
// so they can never be downloaded directly by URL - only via an authenticated,
// access-checked controller route (see controllers/bookController.js / examController.js).
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let dir;
    if (file.fieldname === 'cover') {
      dir = path.join(__dirname, '..', 'public', 'uploads', 'covers');
    } else if (req.baseUrl.includes('exam')) {
      dir = path.join(__dirname, '..', 'uploads', 'exams');
    } else {
      dir = path.join(__dirname, '..', 'uploads', 'books');
    }
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'cover') {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Cover must be an image file.'));
    }
  } else if (file.fieldname === 'resource') {
    const allowed = ['application/pdf', 'application/epub+zip', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Resource file must be a PDF, EPUB or Word document.'));
    }
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: (parseInt(process.env.MAX_UPLOAD_MB, 10) || 50) * 1024 * 1024 }
});

module.exports = upload;
