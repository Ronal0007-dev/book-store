const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const PDF_EXT = '.pdf';
// Common office formats we'll auto-convert to PDF so every resource can go
// through the same protected canvas-based reader (see views/reader.pug).
const CONVERTIBLE_EXT = ['.doc', '.docx', '.ppt', '.pptx', '.odt', '.rtf', '.epub'];

/**
 * Converts a non-PDF office document to PDF using LibreOffice's headless CLI
 * (`soffice --headless --convert-to pdf`). This REQUIRES LibreOffice to be
 * installed on the server (e.g. `apt-get install libreoffice`) - it is not an
 * npm package, since PDF conversion of Office documents needs a real
 * rendering engine, not a pure-JS library.
 *
 * Returns { status: 'not_needed' | 'converted' | 'failed', outputPath? , error? }
 */
function convertToPdfIfNeeded(filePath) {
  return new Promise((resolve) => {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === PDF_EXT) {
      return resolve({ status: 'not_needed', outputPath: filePath });
    }

    if (!CONVERTIBLE_EXT.includes(ext)) {
      // Not a format we know how to convert (shouldn't normally happen since
      // upload middleware already restricts allowed mimetypes).
      return resolve({ status: 'failed', error: `Unsupported file type for conversion: ${ext}` });
    }

    const outDir = path.dirname(filePath);

    execFile('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', outDir, filePath], { timeout: 120000 }, (err) => {
      if (err) {
        // Most commonly: LibreOffice isn't installed on this server. We don't
        // crash the upload - the original file is kept, but it won't be
        // viewable through the protected reader until converted.
        return resolve({
          status: 'failed',
          error: 'LibreOffice conversion failed (is `soffice` installed on this server? try: apt-get install libreoffice). ' + err.message
        });
      }

      const expectedOutput = path.join(outDir, path.basename(filePath, ext) + '.pdf');
      if (!fs.existsSync(expectedOutput)) {
        return resolve({ status: 'failed', error: 'Conversion reported success but no PDF was produced.' });
      }

      resolve({ status: 'converted', outputPath: expectedOutput });
    });
  });
}

module.exports = { convertToPdfIfNeeded, CONVERTIBLE_EXT, PDF_EXT };
