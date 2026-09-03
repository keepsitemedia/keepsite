// The pages are static and the token is per client, so ?c= and ?t= are read
// here and written into the form's hidden fields. Without them the submission
// is refused, which is the intended behaviour for anyone who found the URL.
(function () {
  var form = document.querySelector('.questionnaire');
  if (!form) return;

  // The same transport fields the server excludes from validation
  // (netlify/functions/lib/validate.mjs). The token is supplied per visit by
  // the link, not by the client, so a stored copy could only ever be staler
  // than the one in the URL — rotating KEEPSITE_TOKEN_SECRET to revoke a link
  // would otherwise be silently undone by the restore loop reinstating the
  // old token. Excluded from both save and restore so a stale token never
  // even reaches storage.
  var TRANSPORT = { 'bot-field': 1, form: 1, formVersion: 1, c: 1, t: 1 };

  var params = new URLSearchParams(window.location.search);
  var slug = params.get('c') || '';
  var token = params.get('t') || '';
  form.querySelector('input[name="c"]').value = slug;
  form.querySelector('input[name="t"]').value = token;
  form.dataset.slug = slug;

  // The brand page ships every published demo as JSON (one static page
  // serving any client) so the placeholder radios are swapped here for the
  // four directions belonging to the client named by ?c=.
  var demos = document.getElementById('demos');
  if (demos) {
    var group = form.querySelector('input[name="pick"]');
    var list = JSON.parse(demos.textContent)[slug];
    if (group && list) {
      var container = group.closest('fieldset');
      container.querySelectorAll('.option').forEach(function (el) { el.remove(); });
      list.concat([{ number: null, id: 'mix' }]).forEach(function (d) {
        var label = document.createElement('label');
        label.className = 'option';
        label.innerHTML =
          '<input type="radio" name="pick" value="' + d.id + '"><span>' +
          (d.number ? 'Demo ' + d.number : 'A mix of several') + '</span>';
        container.appendChild(label);
      });
    }
  }

  // Scoped by form and slug so two clients on one browser, or one client's
  // two forms, never collide in the same store.
  var key = 'keepsite:questionnaire:' + form.dataset.form + ':' + slug;

  try {
    var saved = JSON.parse(window.localStorage.getItem(key) || '{}');
    Object.keys(saved).forEach(function (name) {
      if (TRANSPORT[name]) return;
      form.querySelectorAll('[name="' + name + '"]').forEach(function (el) {
        if (el.type === 'checkbox' || el.type === 'radio') {
          el.checked = saved[name].indexOf(el.value) !== -1;
        } else if (el.type !== 'file') {
          // A file input's value cannot be set programmatically, and
          // pretending otherwise would show a client a filename that will
          // not be submitted.
          el.value = saved[name][0] || '';
        }
      });
    });
  } catch (e) { /* a cleared or unavailable store is not an error */ }

  var pending;
  form.addEventListener('input', function () {
    window.clearTimeout(pending);
    pending = window.setTimeout(function () {
      var out = {};
      new FormData(form).forEach(function (value, name) {
        if (typeof value !== 'string' || TRANSPORT[name]) return;
        (out[name] = out[name] || []).push(value);
      });
      try { window.localStorage.setItem(key, JSON.stringify(out)); } catch (e) { /* full or blocked */ }
    }, 400);
  });

  form.addEventListener('submit', function () {
    try { window.localStorage.removeItem(key); } catch (e) { /* nothing to clear */ }
  });
})();
