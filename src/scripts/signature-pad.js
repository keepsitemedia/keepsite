// A signature pad with no dependency: pointer events on a canvas, a Clear
// button, and the PNG written into a hidden input on submit. The submit
// button stays disabled until there is ink, every consent is ticked, and
// the agreement has been scrolled to its end.
(function () {
  document.querySelectorAll('[data-signature-pad]').forEach(function (pad) {
    var canvas = pad.querySelector('canvas');
    var clear = pad.querySelector('[data-clear]');
    var form = pad.closest('form');
    var target = form.querySelector('input[name="' + pad.getAttribute('data-target') + '"]');
    var submit = form.querySelector('button[type="submit"]');
    var consents = Array.prototype.slice.call(form.querySelectorAll('[data-required-consent]'));
    var scrollId = pad.getAttribute('data-scroll-target');
    var scrollBox = scrollId ? document.getElementById(scrollId) : null;
    var scrolled = !scrollBox;
    var inked = false;
    var ctx = canvas.getContext('2d');
    var ratio = window.devicePixelRatio || 1;

    function size() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = w * ratio; canvas.height = h * ratio;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1F2421';
    }
    function ready() { submit.disabled = !(inked && scrolled && consents.every(function (c) { return c.checked; })); }
    function pos(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

    size();
    var drawing = false;
    canvas.addEventListener('pointerdown', function (e) {
      drawing = true; canvas.setPointerCapture(e.pointerId);
      var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
      // A tap with no drag never fires pointermove, so draw the dot here too
      // (lineTo the same point, round linecap) or it counts as ink with
      // nothing on the canvas.
      ctx.lineTo(p.x, p.y); ctx.stroke();
      inked = true; ready();
    });
    canvas.addEventListener('pointermove', function (e) { if (!drawing) return; var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); inked = true; ready(); });
    function stop() { drawing = false; }
    canvas.addEventListener('pointerup', stop); canvas.addEventListener('pointercancel', stop); canvas.addEventListener('pointerleave', stop);
    if (clear) clear.addEventListener('click', function () { ctx.clearRect(0, 0, canvas.width, canvas.height); inked = false; ready(); });
    consents.forEach(function (c) { c.addEventListener('change', ready); });
    if (scrollBox) {
      var check = function () { if (scrollBox.scrollTop + scrollBox.clientHeight >= scrollBox.scrollHeight - 8) { scrolled = true; ready(); } };
      scrollBox.addEventListener('scroll', check); check();
    }
    form.addEventListener('submit', function (e) {
      if (!inked) { e.preventDefault(); return; }
      target.value = canvas.toDataURL('image/png');
    });
    ready();
  });
})();
