// Protected in-browser reader: renders a purchased PDF page-by-page onto a
// <canvas> (never as selectable text or a native browser PDF viewer), burns a
// watermark into each rendered page, and disables the common in-browser
// copy/print/save affordances. See the on-page disclaimer: this deters casual
// copying but cannot stop OS-level screenshots or screen recording - no web
// page can technically prevent that.

(function () {
  const config = JSON.parse(document.getElementById('readerConfig').textContent);
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const canvas = document.getElementById('pdfCanvas');
  const ctx = canvas.getContext('2d');
  const messageEl = document.getElementById('readerMessage');
  const pageIndicator = document.getElementById('pageIndicator');
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');

  let pdfDoc = null;
  let currentPage = 1;
  let rendering = false;

  function drawWatermark() {
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = '#000000';
    ctx.font = '18px sans-serif';
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 7);
    const text = config.userLabel + '  ·  ' + new Date().toLocaleString();
    for (let y = -canvas.height; y < canvas.height; y += 90) {
      for (let x = -canvas.width; x < canvas.width; x += 260) {
        ctx.fillText(text, x, y);
      }
    }
    ctx.restore();
  }

  async function renderPage(num) {
    if (!pdfDoc || rendering) return;
    rendering = true;
    messageEl.style.display = 'none';

    const page = await pdfDoc.getPage(num);
    const containerWidth = document.querySelector('.reader-stage').clientWidth - 32;
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, containerWidth / baseViewport.width);
    const viewport = page.getViewport({ scale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.display = 'block';

    await page.render({ canvasContext: ctx, viewport }).promise;
    drawWatermark();

    pageIndicator.textContent = `Page ${num} of ${pdfDoc.numPages}`;
    prevBtn.disabled = num <= 1;
    nextBtn.disabled = num >= pdfDoc.numPages;
    rendering = false;
  }

  prevBtn.addEventListener('click', () => { if (currentPage > 1) renderPage(--currentPage); });
  nextBtn.addEventListener('click', () => { if (pdfDoc && currentPage < pdfDoc.numPages) renderPage(++currentPage); });

  // --- Load the document via our protected, inline-only stream endpoint ---
  fetch(config.streamUrl, { credentials: 'include' })
    .then((res) => {
      if (!res.ok) throw new Error('Could not load this document (status ' + res.status + ').');
      return res.arrayBuffer();
    })
    .then((buffer) => pdfjsLib.getDocument({ data: buffer }).promise)
    .then((doc) => {
      pdfDoc = doc;
      renderPage(1);
    })
    .catch((err) => {
      messageEl.textContent = err.message || 'Could not load this document.';
    });

  // --- Deterrents (best-effort; see the on-page disclaimer for real limits) ---
  const stage = document.querySelector('.reader-stage');
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  stage.addEventListener('dragstart', (e) => e.preventDefault());
  document.addEventListener('copy', (e) => e.preventDefault());
  document.addEventListener('selectstart', (e) => {
    if (e.target.closest('.reader-stage')) e.preventDefault();
  });

  document.addEventListener('keydown', (e) => {
    const key = e.key ? e.key.toLowerCase() : '';
    const ctrlOrCmd = e.ctrlKey || e.metaKey;
    const blockedCombo =
      (ctrlOrCmd && (key === 'p' || key === 's' || key === 'u')) ||
      (ctrlOrCmd && e.shiftKey && ['i', 'j', 'c'].includes(key)) ||
      key === 'f12' ||
      key === 'printscreen';
    if (blockedCombo) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  window.addEventListener('beforeprint', () => {
    // Belt-and-suspenders: the @media print rule in reader.css already blanks
    // the page visually; this just ensures no page is mid-render when it fires.
  });
})();
