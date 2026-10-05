/* ============================================================
   AI My Life — shared slide-deck behaviour

   Expects the markup every deck in this folder uses:
     .slide-area > .slide[data-notes]   the slides
     #prevBtn / #nextBtn / #counter     the controls
     #notesText                         the presenter bar

   Navigation: on-screen buttons, arrow keys, space, PageUp/Down,
   Home/End. The URL hash tracks the slide (#7) so a specific slide
   can be linked to. Add ?notes to show the presenter bar.
   ============================================================ */
(function () {
  const slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  if (!slides.length) return;

  const area = document.querySelector('.slide-area');
  const counter = document.getElementById('counter');
  const notes = document.getElementById('notesText');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

  let current = 0;

  function show(n) {
    current = Math.max(0, Math.min(slides.length - 1, n));

    slides.forEach((slide, i) => slide.classList.toggle('active', i === current));

    if (counter) counter.textContent = (current + 1) + ' / ' + slides.length;
    if (notes) notes.textContent = slides[current].getAttribute('data-notes') || '';
    if (prevBtn) prevBtn.disabled = current === 0;
    if (nextBtn) nextBtn.disabled = current === slides.length - 1;

    // A long slide left scrolled halfway looks broken on the next one.
    if (area) area.scrollTop = 0;

    // Deep links to a single slide, without adding history entries.
    try {
      history.replaceState(null, '', '#' + (current + 1));
    } catch (e) { /* file:// and other opaque origins — not worth failing over */ }
  }

  if (prevBtn) prevBtn.addEventListener('click', () => show(current - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => show(current + 1));

  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
      case ' ':
        e.preventDefault(); show(current + 1); break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault(); show(current - 1); break;
      case 'Home':
        e.preventDefault(); show(0); break;
      case 'End':
        e.preventDefault(); show(slides.length - 1); break;
    }
  });

  if (new URLSearchParams(location.search).has('notes')) {
    document.body.classList.add('show-notes');
  }

  const fromHash = parseInt(location.hash.slice(1), 10);
  show(fromHash > 0 ? fromHash - 1 : 0);
})();
