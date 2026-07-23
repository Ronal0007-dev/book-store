const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const sharp = require('sharp');

const IMAGE_MAX_WIDTH = parseInt(process.env.IMAGE_MAX_WIDTH, 10) || 1000;
const IMAGE_QUALITY = parseInt(process.env.IMAGE_QUALITY, 10) || 78;
// Ghostscript PDF presets, smallest to largest output:
//   /screen  (~72dpi, lowest quality)  /ebook (~150dpi, good default)  /printer (~300dpi)
const PDF_QUALITY_PRESET = process.env.PDF_QUALITY_PRESET || 'ebook';

/**
 * Compresses/resizes an uploaded cover image in place: caps the longest side
 * at IMAGE_MAX_WIDTH and re-encodes with sharp (JPEG/PNG/WebP all supported)
 * at IMAGE_QUALITY. Runs after multer saves the original upload.
 * Returns { compressed: boolean, originalSize, newSize, path }.
 */
async function compressImage(filePath) {
  const originalSize = fs.statSync(filePath).size;
  const ext = path.extname(filePath).toLowerCase();
  const tmpPath = filePath + '.tmp';

  try {
    let pipeline = sharp(filePath).rotate() // auto-orient from EXIF, then strip it
      .resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true });

    if (ext === '.png') {
      pipeline = pipeline.png({ quality: IMAGE_QUALITY, compressionLevel: 9 });
    } else if (ext === '.webp') {
      pipeline = pipeline.webp({ quality: IMAGE_QUALITY });
    } else {
      // Default to JPEG encoding for .jpg/.jpeg and anything else photographic
      pipeline = pipeline.jpeg({ quality: IMAGE_QUALITY, mozjpeg: true });
    }

    await pipeline.toFile(tmpPath);

    const newSize = fs.statSync(tmpPath).size;
    // Only replace the original if compression actually made it smaller -
    // small/simple images can occasionally grow slightly under re-encoding.
    if (newSize < originalSize) {
      fs.renameSync(tmpPath, filePath);
      return { compressed: true, originalSize, newSize, path: filePath };
    }
    fs.unlinkSync(tmpPath);
    return { compressed: false, originalSize, newSize: originalSize, path: filePath };
  } catch (err) {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    return { compressed: false, originalSize, newSize: originalSize, path: filePath, error: err.message };
  }
}

/**
 * Compresses a PDF in place using Ghostscript (`gs`), which downsamples
 * embedded images and re-optimizes the file structure. REQUIRES Ghostscript
 * installed on the server (e.g. `apt-get install ghostscript`) - like the
 * LibreOffice conversion step, this is a system binary, not an npm package,
 * because real PDF recompression needs a real PDF engine.
 * Returns { compressed: boolean, originalSize, newSize, path, error? }.
 */
function compressPdf(filePath) {
  return new Promise((resolve) => {
    const originalSize = fs.statSync(filePath).size;
    const tmpPath = filePath.replace(/\.pdf$/i, '') + '.compressed.pdf';

    const args = [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      `-dPDFSETTINGS=/${PDF_QUALITY_PRESET}`,
      '-dNOPAUSE', '-dBATCH', '-dQUIET',
      `-sOutputFile=${tmpPath}`,
      filePath
    ];

    execFile('gs', args, { timeout: 120000 }, (err) => {
      if (err || !fs.existsSync(tmpPath)) {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        return resolve({
          compressed: false, originalSize, newSize: originalSize, path: filePath,
          error: err ? `Ghostscript compression failed (is 'gs' installed? try: apt-get install ghostscript). ${err.message}` : 'No output produced.'
        });
      }

      const newSize = fs.statSync(tmpPath).size;
      // Same safety check - keep the smaller of the two files.
      if (newSize < originalSize) {
        fs.renameSync(tmpPath, filePath);
        return resolve({ compressed: true, originalSize, newSize, path: filePath });
      }
      fs.unlinkSync(tmpPath);
      resolve({ compressed: false, originalSize, newSize: originalSize, path: filePath });
    });
  });
}

module.exports = { compressImage, compressPdf, IMAGE_MAX_WIDTH, IMAGE_QUALITY, PDF_QUALITY_PRESET };
