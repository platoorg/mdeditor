// Plato markdown editor — standalone, no framework dependencies.
// Depends on: marked.min.js (must be loaded before this file)
//
// Usage:
//   initMarkdownEditor(fieldName, options)
//
// Options:
//   draftURL  string  — REST endpoint for autosave (GET/PUT/DELETE). Omit to disable.
//
// DOM contract (all scoped to #md-wrapper-{fieldName}):
//   .md-textarea             — <textarea name="{fieldName}">
//   .md-tab[data-target]     — Write / Preview tab buttons
//   .md-fs-btn               — fullscreen toggle button
//   .md-preview-content      — rendered HTML target inside the preview pane

(function () {
    var expandIcon   = '<svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M1 1h5v2H3v3H1zm11 0h5v5h-2V3h-3zM1 12h2v3h3v2H1zm14 3h-3v2h5v-5h-2z"/></svg>';
    var collapseIcon = '<svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M6 1H4v3H1v2h5zm6 0h2v3h3v2h-5zM6 17H4v-3H1v-2h5zm6 0h2v-3h3v-2h-5z"/></svg>';

    window.initMarkdownEditor = function (fieldName, options) {
        var opts     = options || {};
        var draftURL = opts.draftURL || null;

        var wrapper = document.getElementById('md-wrapper-' + fieldName);
        if (!wrapper) return;

        var previewPaneId = 'md-preview-' + fieldName;
        var textarea      = wrapper.querySelector('.md-textarea');
        var serverValue   = textarea.value;
        var tabs          = wrapper.querySelectorAll('.md-tab');

        // --- Tab switching + live preview ---
        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                tabs.forEach(function (t) { t.classList.remove('is-active'); });
                tab.classList.add('is-active');
                var targetId = tab.dataset.target;
                wrapper.querySelectorAll('.md-pane').forEach(function (pane) {
                    pane.style.display = (pane.id === targetId) ? '' : 'none';
                });
                if (targetId === previewPaneId) {
                    document.getElementById(previewPaneId).querySelector('.md-preview-content').innerHTML =
                        marked.parse(textarea.value || '');
                }
            });
        });

        // --- Draft autosave ---
        if (draftURL) {
            var draftNote = document.createElement('p');
            draftNote.className  = 'md-draft-note';
            draftNote.style.cssText = 'margin-top:0.25rem;min-height:1.2em;font-size:0.85em;color:#888';
            wrapper.parentNode.insertBefore(draftNote, wrapper.nextSibling);

            fetch(draftURL).then(function (res) {
                if (res.status === 204) return null;
                return res.json();
            }).then(function (draft) {
                if (!draft || draft.value === serverValue) return;
                textarea.value = draft.value;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                window._draftSaved = true;
                var timeStr   = draft.updated_at ? ' from ' + new Date(draft.updated_at).toLocaleString() : '';
                var discardId = 'md-discard-' + fieldName;
                draftNote.innerHTML =
                    '<span style="color:#3273dc">Draft restored' + timeStr + '.</span> ' +
                    '<a href="#" style="color:#f14668" id="' + discardId + '">Discard</a>';
                document.getElementById(discardId).addEventListener('click', function (e) {
                    e.preventDefault();
                    fetch(draftURL, { method: 'DELETE' });
                    textarea.value = serverValue;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    draftNote.textContent = '';
                });
            });

            var draftTimer = null;
            textarea.addEventListener('input', function () {
                window._draftSaved = false;
                clearTimeout(draftTimer);
                draftTimer = setTimeout(function () {
                    fetch(draftURL, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ value: textarea.value })
                    }).then(function () { window._draftSaved = true; });
                    draftNote.innerHTML = '<span style="color:#b5b5b5">Draft saved</span>';
                }, 1000);
            });

            var form = document.getElementById('contentForm');
            if (form) {
                form.addEventListener('submit', function () {
                    fetch(draftURL, { method: 'DELETE' });
                }, { once: true });
            }
        }

        // --- Fullscreen ---
        var fsBtn = wrapper.querySelector('.md-fs-btn');
        fsBtn.innerHTML = expandIcon;
        fsBtn.addEventListener('click', function () {
            var entering = !wrapper.classList.contains('is-fullscreen');
            wrapper.classList.toggle('is-fullscreen', entering);
            document.body.style.overflow = entering ? 'hidden' : '';
            fsBtn.title   = entering ? 'Exit fullscreen (Esc)' : 'Fullscreen writing mode';
            fsBtn.innerHTML = entering ? collapseIcon : expandIcon;
            textarea.focus();
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && wrapper.classList.contains('is-fullscreen')) {
                wrapper.classList.remove('is-fullscreen');
                document.body.style.overflow = '';
                fsBtn.title   = 'Fullscreen writing mode';
                fsBtn.innerHTML = expandIcon;
            }
        });
    };
}());
