require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const morgan = require('morgan');

const { apiLimiter } = require('./middleware/rateLimiter');
const apiRoutes = require('./routes/api');
const webRoutes = require('./routes/web');

const app = express();

// Trust the first proxy hop (needed for req.ip to reflect the real client IP
// when deployed behind Nginx / a load balancer - required for correct per-IP rate limiting).
app.set('trust proxy', 1);

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limit every API request per IP address.
app.use('/api', apiLimiter);
app.use('/api', apiRoutes);

// Server-rendered (Pug) pages.
app.use('/', webRoutes);

// 404 handler
app.use((req, res) => {
  if (req.originalUrl.startsWith('/api')) {
    return res.status(404).json({ success: false, message: 'Route not found.' });
  }
  res.status(404).render('404', { user: req.user || null });
});

// Central error handler (e.g. Multer file-size/type errors)
app.use((err, req, res, next) => {
  console.error(err);
  if (req.originalUrl.startsWith('/api')) {
    return res.status(500).json({ success: false, message: err.message || 'Server error.' });
  }
  res.status(500).send('Something went wrong.');
});

module.exports = app;
