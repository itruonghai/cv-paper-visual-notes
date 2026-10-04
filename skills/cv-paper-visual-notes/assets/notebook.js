/* Self-contained reading UI. Reader data is never inserted as HTML. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const seed = JSON.parse($('notebook-seed').textContent), A = CvAnnotations;
  const t = key => seed.ui[key];
  const editor = $('notes-editor'), status = $('save-status'), actionStatus = $('action-status');
  const notesKey = 'cv-paper-notes:' + JSON.stringify([seed.paperId, seed.version]);
  const captureKey = 'cv-paper-annotations:' + JSON.stringify([seed.paperId, seed.version]);
  let baseHash = seed.notesHash, cached = null, previousText = null, notesStorage = true;
  let doc = A.clone(seed.annotations), captureBase = A.clone(seed.annotations), captureStored = null;
  let folderCaptureBase = A.clone(seed.annotations);
  let captureStorageBlocked = false;
  let pendingTarget = null, editingId = null, composing = null, folder = null, diskPending = null;
  let baseline = {notes: seed.notes, annotations: seed.annotationFile}, folderDirty = false;
  let busy = false, recovery = [], anchors = new Map(), selected = new Set();
  let notesStored = null;
  const now = () => new Date().toISOString();
  function report(element, message) { $(element).textContent = message; }
  function download(text, name, mime = 'text/markdown') {
    const url = URL.createObjectURL(new Blob([text], {type: mime + ';charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const json = value => JSON.stringify(value, null, 2) + '\n';
  function remember(value) {
    recovery.push({at: now(), ...A.clone(value)});
    // Recovery is included in browser storage and portable recovery downloads.
    // Never evict old copies just to keep a small buffer.
  }
  function preserveRecovery() {
    try { localStorage.setItem(captureKey + ':recovery', json(recovery)); }
    catch (_) { report('annotation-status', t('recovery_download_needed')); }
  }
  try { recovery = JSON.parse(localStorage.getItem(captureKey + ':recovery') || '[]'); if (!Array.isArray(recovery)) recovery = []; }
  catch (_) { recovery = []; }
  try { notesStored = localStorage.getItem(notesKey); cached = JSON.parse(notesStored || 'null'); }
  catch (_) { notesStorage = false; }
  if (cached && typeof cached.text === 'string') {
    editor.value = cached.text;
    baseHash = cached.text === seed.notes ? seed.notesHash : cached.baseHash;
    $('conflict').classList.toggle('hidden', baseHash === seed.notesHash || cached.text === seed.notes);
    previousText = typeof cached.previousText === 'string' ? cached.previousText : null;
  } else editor.value = seed.notes;
  $('notes-snapshot').textContent = seed.notes;
  status.textContent = notesStorage ? t(cached ? 'draft_restored' : 'file_loaded') : t('storage_unavailable');
  function showPrevious() {
    $('previous-panel').classList.toggle('hidden', previousText === null);
    $('previous-text').textContent = previousText || '';
  }
  function saveNotesDraft() {
    try {
      const latest = localStorage.getItem(notesKey);
      if (latest && latest !== notesStored) {
        const other = JSON.parse(latest);
        if (typeof other.text === 'string' && other.text !== editor.value) {
          remember({other_notes: other.text}); previousText = other.text; showPrevious(); preserveRecovery();
          actionStatus.textContent = t('other_tab_notes');
        }
      }
      notesStored = json({text: editor.value, baseHash, previousText, updatedAt: now()});
      localStorage.setItem(notesKey, notesStored);
      status.textContent = t('draft_saved');
    } catch (_) { status.textContent = t('storage_unavailable'); }
  }
  function dirty() {
    folderDirty = true;
    if (folder) report('folder-status', t('folder_unsaved'));
  }
  // Tabs share one storage key, so merge another tab's write against the last
  // storage state this tab saw. The build's file is too old a base: it turns
  // sequential edits of one capture into false conflicts.
  function lastSynced() {
    try { return JSON.parse(captureStored).doc || captureBase; } catch (_) { return captureBase; }
  }
  function saveCapturesDraft() {
    if (captureStorageBlocked) {
      report('annotation-status', t('capture_storage_failed')); return;
    }
    try {
      const actual = localStorage.getItem(captureKey);
      if (actual && actual !== captureStored) {
        const other = JSON.parse(actual); A.validate(other.doc, seed.paperId, seed.version);
        remember({annotations: doc, other: other.doc});
        const merged = A.merge(lastSynced(), doc, other.doc); doc = merged.doc;
        report('annotation-status', t(merged.conflicts ? 'capture_conflicts' : 'captures_merged'));
      } else report('annotation-status', t('captures_draft'));
      captureStored = json({doc, base: captureBase});
      localStorage.setItem(captureKey, captureStored); preserveRecovery();
    } catch (error) { report('annotation-status', t('capture_storage_failed') + ' ' + error.message); }
  }
  try {
    captureStored = localStorage.getItem(captureKey);
    if (captureStored) {
      const saved = JSON.parse(captureStored); A.validate(saved.doc, seed.paperId, seed.version);
      if (saved.base) A.validate(saved.base, seed.paperId, seed.version);
      const merged = A.merge(saved.base, saved.doc, seed.annotations); doc = merged.doc;
      report('annotation-status', t(merged.conflicts ? 'capture_conflicts' : 'captures_restored'));
    } else report('annotation-status', t('captures_loaded'));
  } catch (error) {
    // Keep unreadable/future-version drafts recoverable; don't replace their key on load.
    captureStorageBlocked = true;
    remember({unreadable_browser_draft: captureStored}); preserveRecovery();
    report('annotation-status', t('capture_storage_failed') + ' ' + error.message);
  }
  function resolveNotes(useFile) {
    if (useFile) { remember({notes: editor.value}); previousText = editor.value; editor.value = seed.notes; showPrevious(); preserveRecovery(); }
    baseHash = seed.notesHash; $('conflict').classList.add('hidden'); saveNotesDraft(); dirty(); updatePrompt();
    actionStatus.textContent = t(useFile ? 'file_chosen' : 'draft_kept');
  }
  $('keep-draft').onclick = () => resolveNotes(false);
  $('use-file').onclick = () => resolveNotes(true);
  $('download-previous').onclick = () => download(previousText || '', 'notes-previous-draft.md');
  $('export-notes').onclick = () => { download(editor.value, 'notes.md'); actionStatus.textContent = t('download_requested'); };
  $('export-snapshot').onclick = () => download(seed.notes, 'notes-file-snapshot.md');
  editor.addEventListener('input', () => { saveNotesDraft(); dirty(); updatePrompt(); });
  $('import-notes').onchange = async event => {
    try {
      const file = event.target.files[0]; if (!file) return;
      const text = await file.text();
      if (text !== editor.value && !confirm(t('import_confirm'))) return;
      remember({notes: editor.value}); previousText = editor.value; editor.value = text;
      baseHash = seed.notesHash; $('conflict').classList.add('hidden'); showPrevious(); preserveRecovery(); saveNotesDraft(); dirty(); updatePrompt();
      actionStatus.textContent = t('imported');
    } catch (error) { actionStatus.textContent = t('import_failed') + ' ' + error.message; }
    finally { event.target.value = ''; }
  };
  window.addEventListener('storage', event => {
    if (event.key === notesKey && event.newValue) {
      try {
        const other = JSON.parse(event.newValue);
        if (typeof other.text === 'string' && other.text !== editor.value) {
          remember({notes: editor.value, other_notes: other.text}); previousText = other.text; showPrevious(); preserveRecovery();
          actionStatus.textContent = t('other_tab_notes');
        }
      } catch (_) { actionStatus.textContent = t('storage_unavailable'); }
    }
    if (event.key === captureKey && event.newValue && event.newValue !== captureStored) {
      try {
        const other = JSON.parse(event.newValue); A.validate(other.doc, seed.paperId, seed.version);
        remember({annotations: doc, other: other.doc});
        const result = A.merge(lastSynced(), doc, other.doc); doc = result.doc; captureStored = event.newValue;
        preserveRecovery(); dirty(); renderCaptures(); report('annotation-status', t(result.conflicts ? 'capture_conflicts' : 'captures_merged'));
      } catch (error) { report('annotation-status', t('capture_storage_failed') + ' ' + error.message); }
    }
  });

  // Text offsets use authored text only. UI buttons are excluded so they do not
  // shift stored anchors; the original section DOM and figure pixels stay intact.
  function textNodes(section) {
    const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT, {acceptNode(node) {
      return node.parentElement.closest('button,script,style,[data-capture-ui],.katex-mathml') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    }});
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode); return nodes;
  }
  function pointOffset(nodes, container, offset) {
    const point = document.createRange(); point.setStart(container, offset); point.collapse(true);
    let total = 0;
    for (const node of nodes) {
      if (node === container) return total + offset;
      if (point.comparePoint(node, node.length) <= 0) total += node.length;
      else break;
    }
    return total;
  }
  function textRange(nodes, start, end) {
    const range = document.createRange(); let total = 0, started = false;
    for (const node of nodes) {
      if (!started && start < total + node.length) { range.setStart(node, Math.max(0, start - total)); started = true; }
      if (started && end <= total + node.length) { range.setEnd(node, Math.max(0, end - total)); return range; }
      total += node.length;
    }
    return null;
  }
  const textTarget = (text, start, end) =>
    ({exact: text.slice(start, end), prefix: text.slice(Math.max(0, start - 48), start), suffix: text.slice(end, end + 48), start, end});
  const elementOf = node => node.nodeType === 1 ? node : node.parentElement;
  // A text capture target for a DOM range inside one annotatable section.
  function rangeTarget(range) {
    const section = elementOf(range.startContainer).closest('[data-annotatable]');
    if (!section || elementOf(range.endContainer).closest('[data-annotatable]') !== section) return null;
    if (elementOf(range.startContainer).closest('[data-capture-ui]')) return null;
    const nodes = textNodes(section), text = nodes.map(n => n.data).join('');
    const start = pointOffset(nodes, range.startContainer, range.startOffset), end = pointOffset(nodes, range.endContainer, range.endOffset);
    if (!text.slice(start, end).trim()) return null;
    // Only explicitly attributed spans are treated as source quotations.
    const origin = elementOf(range.startContainer).closest('[data-origin]');
    const originEnd = elementOf(range.endContainer).closest('[data-origin]');
    const kind = origin && origin === originEnd && ['original-caption', 'paper-passage', 'user-note'].includes(origin.dataset.origin) ? origin.dataset.origin : 'notebook-prose';
    return {
      kind: 'text', section_id: section.id, section_title: section.querySelector('h2').textContent,
      content_revision: seed.sectionRevisions[section.id],
      source: {kind, ref: kind === 'notebook-prose' ? 'notebook.html#' + section.id : (origin.dataset.sourceRef || seed.sourceUrl || section.id)},
      target: textTarget(text, start, end)
    };
  }
  function selectionTarget() {
    const selection = getSelection(); if (!selection.rangeCount || selection.isCollapsed) return null;
    return rangeTarget(selection.getRangeAt(0));
  }
  const selectionBox = () => getSelection().rangeCount ? getSelection().getRangeAt(0).getBoundingClientRect() : null;
  function caretAt(x, y) {
    if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); return p && {node: p.offsetNode, offset: p.offset}; }
    const r = document.caretRangeFromPoint?.(x, y); return r && {node: r.startContainer, offset: r.startOffset};
  }
  // The authored text position under the pointer, only when the pointer is over that text.
  function textPoint(x, y) {
    const caret = caretAt(x, y); if (!caret || caret.node.nodeType !== 3) return null;
    const parent = caret.node.parentElement, section = parent.closest('[data-annotatable]');
    if (!section || parent.closest('button,[data-capture-ui]')) return null;
    // Caret APIs snap to the nearest text, so require the pointer to be over its line boxes.
    const probe = document.createRange(); probe.selectNodeContents(caret.node);
    if (![...probe.getClientRects()].some(box => x >= box.left - 2 && x <= box.right + 2 && y >= box.top - 2 && y <= box.bottom + 2)) return null;
    const nodes = textNodes(section);
    return {section, nodes, text: nodes.map(n => n.data).join(''), node: caret.node, at: pointOffset(nodes, caret.node, caret.offset)};
  }
  // The whole sentence under the pointer, so a central claim needs no manual selection.
  const BLOCKS = 'p,li,td,th,dd,dt,figcaption,blockquote,summary,h3,h4,h5,h6';
  function sentenceTarget(point) {
    const block = point.node.parentElement.closest(BLOCKS);
    if (!block || !point.section.contains(block)) return null;
    const whole = document.createRange(); whole.selectNodeContents(block);
    const from = pointOffset(point.nodes, whole.startContainer, whole.startOffset), to = pointOffset(point.nodes, whole.endContainer, whole.endOffset);
    const sentence = A.sentenceAt(point.text.slice(from, to), point.at - from, document.documentElement.lang);
    const range = sentence && textRange(point.nodes, from + sentence.start, from + sentence.end);
    return range ? rangeTarget(range) : null;
  }
  // Recompute on every selection change so a cleared selection is never reused.
  function readSelection() {
    pendingTarget = selectionTarget();
    $('capture-selection').classList.toggle('hidden', !pendingTarget);
    if (pendingTarget) $('capture-toast').classList.add('hidden');
  }
  let selectionTimer = null;
  document.addEventListener('mouseup', readSelection);
  document.addEventListener('keyup', event => { if (event.key.startsWith('Arrow') || event.key === 'Shift') readSelection(); });
  // Touch selection handles fire no mouseup, so also follow selectionchange.
  document.addEventListener('selectionchange', () => { clearTimeout(selectionTimer); selectionTimer = setTimeout(readSelection, 250); });
  let toastTimer = null;
  function toast(message, undo = null) {
    report('capture-toast-text', message); $('capture-toast').classList.remove('hidden');
    $('capture-undo').classList.toggle('hidden', !undo);
    $('capture-undo').onclick = () => { $('capture-toast').classList.add('hidden'); undo(); };
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('capture-toast').classList.add('hidden'), 6000);
  }
  function setPending(range) {
    if (globalThis.Highlight && CSS.highlights) range ? CSS.highlights.set('cv-pending', new Highlight(range)) : CSS.highlights.delete('cv-pending');
  }
  function clearSelection() {
    getSelection().removeAllRanges(); pendingTarget = null; $('capture-selection').classList.add('hidden');
  }

  // Popover panels sit beside their anchor: below it when there is room,
  // otherwise above, clamped to the viewport. Narrow screens use a bottom sheet (CSS).
  function place(panel, box) {
    const gap = 8, width = panel.offsetWidth, height = panel.offsetHeight;
    let top = box.bottom + gap;
    if (top + height > innerHeight - gap && box.top - gap - height > gap) top = box.top - gap - height;
    top = Math.max(gap, Math.min(top, innerHeight - height - gap));
    const left = Math.max(gap, Math.min(box.left, innerWidth - width - gap));
    panel.style.top = top + scrollY + 'px'; panel.style.left = left + scrollX + 'px';
  }
  const popover = $('capture-popover'), menu = $('capture-menu');
  function chip(value, label) {
    const wrapper = node('label'), input = document.createElement('input');
    input.type = 'radio'; input.name = 'capture-tag'; input.value = value;
    wrapper.append(input, node('span', label)); $('capture-tag').append(wrapper); return input;
  }
  const tagInput = value => [...popover.querySelectorAll('input[name="capture-tag"]')].find(input => input.value === value);
  function openCapture(target, editId = null, box = null) {
    closeMenu(); composing = A.clone(target); editingId = editId;
    $('capture-excerpt').textContent = target.kind === 'text' ? target.target.exact : target.target.caption;
    $('capture-origin').textContent = target.source.kind + ' · ' + target.source.ref;
    $('capture-comment').value = target.comment || '';
    const firstTag = target.tags?.[0] || '';
    (tagInput(firstTag) || chip(firstTag, firstTag)).checked = true;
    if (target.kind === 'text') setPending(editId ? anchors.get(editId) : getSelection().rangeCount ? getSelection().getRangeAt(0).cloneRange() : null);
    popover.classList.remove('hidden');
    place(popover, box || {left: (innerWidth - popover.offsetWidth) / 2, top: innerHeight / 3, bottom: innerHeight / 3});
    $('capture-comment').focus({preventScroll: true});
  }
  function closeCapture() { popover.classList.add('hidden'); setPending(null); composing = null; editingId = null; }
  $('cancel-capture').onclick = closeCapture;
  $('capture-form').addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); $('capture-form').requestSubmit(); }
  });
  function commit() { A.touch(doc); saveCapturesDraft(); dirty(); renderCaptures(); }
  $('capture-form').onsubmit = event => {
    event.preventDefault(); if (!composing) return;
    const tag = popover.querySelector('input[name="capture-tag"]:checked')?.value || '';
    const annotation = {...composing, id: editingId || A.id(), comment: $('capture-comment').value,
      tags: [...new Set([tag, ...(composing.tags || []).slice(1)].filter(Boolean))],
      status: composing.status || 'open', created_at: composing.created_at || now(), updated_at: now()};
    const index = doc.annotations.findIndex(a => a.id === editingId);
    if (index >= 0) doc.annotations[index] = annotation; else doc.annotations.push(annotation);
    const text = composing.kind === 'text';
    closeCapture(); commit();
    // The highlight now marks the passage; keep the reader where they are.
    if (text) clearSelection();
    toast(t('capture_saved'));
  };
  // One-step highlight or key idea, as in computer-based reading tests.
  function quickCapture(target, tags) {
    doc.annotations.push({...A.clone(target), id: A.id(), comment: '', tags, status: 'open', created_at: now(), updated_at: now()});
    commit(); clearSelection(); toast(t(tags.includes('key idea') ? 'key_saved' : 'highlight_saved'));
  }
  $('capture-selection').onpointerdown = event => event.preventDefault();
  $('capture-selection').onclick = event => {
    const action = event.target.closest('[data-action]')?.dataset.action; if (!action || !pendingTarget) return;
    if (action === 'comment') openCapture(pendingTarget, null, selectionBox());
    else quickCapture(pendingTarget, action === 'key' ? ['key idea'] : []);
  };
  const sectionContext = section => ({section_id: section.id, section_title: section.querySelector('h2').textContent,
    content_revision: seed.sectionRevisions[section.id]});
  const figureTarget = figure => ({figure_id: figure.id, fingerprint: figure.dataset.figureFingerprint, files: JSON.parse(figure.dataset.figureFiles),
    caption: figure.querySelector('figcaption')?.textContent || figure.querySelector('img')?.alt || figure.id});
  function figureCapture(figure) {
    const section = figure.closest('[data-annotatable]');
    return {kind: 'figure', ...sectionContext(section), source: {kind: 'figure', ref: figure.querySelector('figcaption a')?.href || seed.sourceUrl || section.id},
      target: figureTarget(figure)};
  }
  document.querySelectorAll('[data-annotatable] figure').forEach(figure => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'figure-comment';
    button.dataset.captureUi = 'true'; button.textContent = t('comment_figure');
    button.onclick = () => openCapture(figureCapture(figure), null, button.getBoundingClientRect());
    figure.append(button);
  });

  // Right-click menu. Shift+right-click, and right-clicks outside the paper
  // sections, keep the browser's own menu.
  function closeMenu() { menu.classList.add('hidden'); menu.replaceChildren(); }
  function openMenu(x, y, items) {
    menu.replaceChildren();
    for (const [label, action] of items) {
      const item = node('button', label); item.type = 'button'; item.setAttribute('role', 'menuitem');
      item.onpointerdown = event => event.preventDefault();
      item.onclick = () => { closeMenu(); action(); };
      menu.append(item);
    }
    menu.append(node('p', t('menu_native_hint'), 'menu-hint'));
    menu.classList.remove('hidden'); place(menu, {left: x, top: y, bottom: y});
    menu.querySelector('[role="menuitem"]').focus({preventScroll: true});
  }
  menu.addEventListener('keydown', event => {
    const items = [...menu.querySelectorAll('[role="menuitem"]')], at = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
    }
  });
  let rightClickSelection;
  // captureAt: the smallest visible text capture under a pointer position.
  function captureAt(point) {
    let best = null, size = Infinity;
    for (const a of doc.annotations) {
      const span = spans.get(a.id);
      if (a.status === 'archived' || !span || span.section !== point.section.id || point.at < span.start || point.at > span.end) continue;
      if (span.end - span.start < size) { best = a; size = span.end - span.start; }
    }
    return best;
  }
  function copyText(text) {
    if (!document.execCommand('copy')) navigator.clipboard?.writeText(text).catch(() => {});
  }
  document.addEventListener('pointerdown', event => {
    // Snapshot before the browser moves the selection (macOS selects a word on right-click).
    if (event.button === 2) rightClickSelection = selectionTarget();
    if (!menu.contains(event.target)) closeMenu();
    const unchanged = composing && $('capture-comment').value === (composing.comment || '');
    if (unchanged && !popover.contains(event.target) && !menu.contains(event.target)) closeCapture();
  }, true);
  document.addEventListener('contextmenu', event => {
    const selected = rightClickSelection !== undefined ? rightClickSelection : selectionTarget(); rightClickSelection = undefined;
    if (event.shiftKey || event.target.closest?.('#capture-menu,#capture-popover,#capture-panel,[data-capture-ui]')) return;
    let x = event.clientX, y = event.clientY;
    if (selected) {
      const box = selectionBox();
      if (box && !x && !y) { x = box.left; y = box.bottom; }  // keyboard context-menu key
      event.preventDefault();
      openMenu(x, y, [
        [t('menu_highlight'), () => quickCapture(selected, [])],
        [t('menu_key_idea'), () => quickCapture(selected, ['key idea'])],
        [t('menu_comment'), () => openCapture(selected, null, box)],
        [t('menu_copy'), () => copyText(selected.target.exact)]]);
      return;
    }
    const point = textPoint(x, y), existing = point && captureAt(point);
    if (existing) {
      event.preventDefault(); getSelection().removeAllRanges();
      const key = existing.tags.includes('key idea'), box = anchors.get(existing.id).getBoundingClientRect();
      openMenu(x, y, [
        [t(existing.comment ? 'menu_edit_comment' : 'menu_add_comment'), () => openCapture(existing, existing.id, box)],
        [t(key ? 'menu_unmark_key' : 'menu_mark_key'), () => mutate(existing, {tags: key ? existing.tags.filter(tag => tag !== 'key idea') : ['key idea', ...existing.tags]})],
        [t('menu_remove'), () => {
          const before = existing.status; mutate(existing, {status: 'archived'});
          toast(t('highlight_removed'), () => mutate(existing, {status: before}));
        }]]);
      return;
    }
    const sentence = point && sentenceTarget(point);
    if (sentence) {
      event.preventDefault(); getSelection().removeAllRanges();
      const box = () => textRange(point.nodes, sentence.target.start, sentence.target.end)?.getBoundingClientRect();
      openMenu(x, y, [
        [t('menu_sentence_highlight'), () => quickCapture(sentence, [])],
        [t('menu_sentence_key'), () => quickCapture(sentence, ['key idea'])],
        [t('menu_sentence_comment'), () => {
          const range = textRange(point.nodes, sentence.target.start, sentence.target.end);
          openCapture(sentence, null, box()); setPending(range);
        }]]);
      return;
    }
    const figure = event.target.closest?.('[data-annotatable] figure');
    if (figure) {
      event.preventDefault();
      openMenu(x, y, [[t('menu_figure_comment'), () => openCapture(figureCapture(figure), null, figure.getBoundingClientRect())]]);
    }
  });
  // Left-click a commented highlight to read or edit its comment.
  document.addEventListener('click', event => {
    if (event.button !== 0 || !getSelection().isCollapsed) return;
    if (event.target.closest('a,button,input,textarea,select,summary,label,[data-capture-ui],#capture-popover,#capture-menu,#capture-panel')) return;
    const point = textPoint(event.clientX, event.clientY), a = point && captureAt(point);
    if (a?.comment) openCapture(a, a.id, anchors.get(a.id).getBoundingClientRect());
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!menu.classList.contains('hidden')) closeMenu(); else if (!popover.classList.contains('hidden')) closeCapture();
  });
  addEventListener('scroll', closeMenu, {passive: true});
  addEventListener('resize', closeMenu);
  // review: captures still attached whose target changed; the reader confirms
  // the new position before its stored target is updated.
  let review = new Map(), spans = new Map();
  function refreshAnchors() {
    anchors = new Map(); review = new Map(); spans = new Map(); const highlights = [];
    for (const a of doc.annotations) {
      if (a.kind === 'figure') {
        // Figure IDs are notebook-unique, so a recaptured or moved figure is still found.
        const figure = $(a.target.figure_id), section = figure?.closest('[data-annotatable]');
        if (!figure?.matches('figure') || !section) continue;
        anchors.set(a.id, figure);
        if (figure.dataset.figureFingerprint !== a.target.fingerprint || section.id !== a.section_id) {
          review.set(a.id, {message: 'figure_changed', action: 'accept_figure', update: {...sectionContext(section), target: figureTarget(figure)}});
        }
      } else {
        const section = $(a.section_id); if (!section?.matches('[data-annotatable]')) continue;
        const nodes = textNodes(section), text = nodes.map(n => n.data).join('');
        const location = A.locate(text, a.target, a.content_revision === seed.sectionRevisions[a.section_id]);
        if (location) {
          const range = textRange(nodes, location.start, location.end);
          if (range) {
            anchors.set(a.id, range); spans.set(a.id, {section: section.id, start: location.start, end: location.end});
            if (a.status !== 'archived') highlights.push([range, a]);
          }
          if (range && location.drifted) {
            review.set(a.id, {message: 'anchor_drifted', action: 'confirm_anchor', update: {...sectionContext(section), target: textTarget(text, location.start, location.end)}});
          }
        }
      }
    }
    if (globalThis.Highlight && CSS.highlights) {
      // cv-captures lists every visible capture; the other three carry the colours.
      const style = a => a.tags.includes('key idea') ? 'cv-key' : a.comment ? 'cv-comment' : 'cv-highlight';
      CSS.highlights.set('cv-captures', new Highlight(...highlights.map(([range]) => range)));
      for (const name of ['cv-highlight', 'cv-comment', 'cv-key']) {
        CSS.highlights.set(name, new Highlight(...highlights.filter(([, a]) => style(a) === name).map(([range]) => range)));
      }
    }
  }
  function jump(a) {
    const anchor = anchors.get(a.id); if (!anchor) return;
    let element = anchor instanceof Range ? anchor.startContainer.parentElement : anchor;
    for (let parent = element; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
    element.scrollIntoView({block: 'center', behavior: 'smooth'});
    if (anchor instanceof Range) {
      if (globalThis.Highlight && CSS.highlights) CSS.highlights.set('cv-active', new Highlight(anchor));
      else { getSelection().removeAllRanges(); getSelection().addRange(anchor); }
    } else { element.tabIndex = -1; element.focus({preventScroll: true}); }
  }
  function node(tag, text, className) {
    const element = document.createElement(tag); if (text !== undefined) element.textContent = text;
    if (className) element.className = className; return element;
  }
  function button(text, callback, parent) {
    const b = node('button', text); b.type = 'button'; b.onclick = callback; parent.append(b); return b;
  }
  function mutate(a, changes) {
    Object.assign(a, changes, {updated_at: now()}); A.touch(doc); saveCapturesDraft(); dirty(); renderCaptures();
  }
  function renderCaptures() {
    refreshAnchors(); const list = $('capture-list'); list.replaceChildren();
    const search = $('capture-search').value.toLocaleLowerCase(), filter = $('capture-filter').value, tag = $('capture-tag-filter').value;
    const items = doc.annotations.filter(a =>
      (filter === 'all' || (filter === 'active' ? a.status !== 'archived' : filter === 'orphan' ? (!anchors.has(a.id) || review.has(a.id)) && a.status !== 'archived' : filter === 'open' ? a.status === 'open' && (a.comment || a.tags.includes('question')) : a.status === filter)) &&
      (!tag || a.tags.includes(tag)) && (!search || JSON.stringify(a).toLocaleLowerCase().includes(search)));
    const sectionOrder = [...document.querySelectorAll('[data-annotatable]')].map(s => s.id);
    items.sort((a, b) => sectionOrder.indexOf(a.section_id) - sectionOrder.indexOf(b.section_id) || a.created_at.localeCompare(b.created_at));
    let lastSection = null;
    for (const a of items) {
      if (lastSection !== a.section_id) { list.append(node('h3', a.section_title)); lastSection = a.section_id; }
      const check = review.get(a.id);
      const card = node('article', undefined, 'capture-card' + (!anchors.has(a.id) ? ' needs-review' : check ? ' needs-check' : '')); card.dataset.annotationId = a.id;
      const label = node('label'), checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(a.id);
      checkbox.onchange = () => { checkbox.checked ? selected.add(a.id) : selected.delete(a.id); updatePrompt(); };
      label.append(checkbox, document.createTextNode(' ' + t('select_for_discussion'))); card.append(label);
      card.append(node('blockquote', a.kind === 'text' ? a.target.exact : a.target.caption));
      if (a.comment) card.append(node('p', a.comment));
      card.append(node('p', a.source.kind + ' · ' + a.status + (a.tags.length ? ' · ' + a.tags.join(', ') : ''), 'meta'));
      if (!anchors.has(a.id)) card.append(node('p', t('needs_reattachment'), 'meta'));
      else if (check) card.append(node('p', t(check.message), 'meta'));
      if (a.conflict_of) card.append(node('p', t('conflicting_copy') + ' ' + a.conflict_of, 'meta'));
      const controls = node('div', undefined, 'note-controls');
      const jumpButton = button(t('jump_capture'), () => jump(a), controls); jumpButton.disabled = !anchors.has(a.id);
      const edit = button(t('edit_capture'), () => openCapture(a, a.id, edit.getBoundingClientRect()), controls);
      button(t(a.status === 'resolved' ? 'reopen_capture' : 'resolve_capture'), () => mutate(a, {status: a.status === 'resolved' ? 'open' : 'resolved'}), controls);
      button(t(a.status === 'archived' ? 'restore_capture' : 'archive_capture'), () => mutate(a, {status: a.status === 'archived' ? 'open' : 'archived'}), controls);
      const history = () => [...(a.target_history || []), {target: a.target, source: a.source, section_id: a.section_id, content_revision: a.content_revision}];
      if (check) button(t(check.action), () => mutate(a, {...A.clone(check.update), target_history: history()}), controls);
      if (!anchors.has(a.id) && a.kind === 'text') {
        const reattach = button(t('reattach_selection'), () => {
          if (!pendingTarget) { report('annotation-status', t('select_to_reattach')); return; }
          if (!confirm(t('reattach_confirm'))) return;
          mutate(a, {...A.clone(pendingTarget), target_history: history()});
        }, controls);
        reattach.onpointerdown = event => event.preventDefault();  // keep the passage selected
      }
      card.append(controls);
      for (const reply of seed.replies[a.id] || []) {
        const details = node('details'), summary = node('summary', t('agent_reply'));
        details.append(summary, node('pre', reply, 'discussion-text')); card.append(details);
      }
      list.append(card);
    }
    if (!items.length) list.append(node('p', t('no_captures')));
    updatePrompt();
  }
  for (const name of ['capture-search', 'capture-filter', 'capture-tag-filter']) $(name).addEventListener('input', renderCaptures);
  $('export-annotations').onclick = () => download(json(doc), 'annotations.json', 'application/json');
  const states = () => Object.fromEntries(doc.annotations.map(a => [a.id, review.has(a.id) ? 'check' : anchors.has(a.id)]));
  $('export-digest').onclick = () => download(A.digest(doc, doc.annotations.filter(a => a.status !== 'archived'), states()), 'annotation-digest.md');
  $('import-annotations').onchange = async event => {
    try {
      const file = event.target.files[0]; if (!file) return;
      const incoming = A.validate(JSON.parse(await file.text()), seed.paperId, seed.version);
      remember({annotations: doc}); const merged = A.merge(null, doc, incoming); doc = merged.doc;
      saveCapturesDraft(); dirty(); renderCaptures(); report('annotation-status', t(merged.conflicts ? 'capture_conflicts' : 'captures_imported'));
    } catch (error) { report('annotation-status', t('import_failed') + ' ' + error.message); }
    finally { event.target.value = ''; }
  };
  function discussionPrompt(capturesOnly = false) {
    const items = doc.annotations.filter(a => selected.size ? selected.has(a.id) : a.status === 'open' && (a.comment || a.tags.includes('question')));
    return t('discussion_template').replace('{paper_id}', seed.paperId).replace('{version}', seed.version) + '\n\n' +
      (capturesOnly ? '' : editor.value + '\n\n') + A.digest(doc, items, states());
  }
  function updatePrompt() { $('discussion-prompt').textContent = discussionPrompt(); }
  async function copyPrompt(capturesOnly) {
    const prompt = discussionPrompt(capturesOnly); $('discussion-prompt').textContent = prompt;
    try { await navigator.clipboard.writeText(prompt); actionStatus.textContent = t('prompt_copied'); }
    catch (_) { $('discussion-prompt-panel').open = true; $('discussion-prompt-panel').scrollIntoView({block: 'center'}); actionStatus.textContent = t('copy_fallback'); }
  }
  $('copy-question').onclick = () => copyPrompt(false); $('copy-captures').onclick = () => copyPrompt(true);
  $('discussion-text').textContent = seed.discussion || t('no_replies');

  // A folder connection is explicit and session-only. Compare both files before
  // opening either writable, keep pre-save backups, then report partial failures.
  async function readFile(directory, name) {
    try { return await (await (await directory.getFileHandle(name)).getFile()).text(); }
    catch (error) { if (error.name === 'NotFoundError') return null; throw error; }
  }
  async function readDisk(directory) {
    const paper = JSON.parse(await readFile(directory, 'paper.json'));
    if (!paper || paper.paper_id !== seed.paperId || paper.version !== seed.version) throw Error(t('wrong_folder'));
    const notes = await readFile(directory, 'notes.md'), annotations = await readFile(directory, 'annotations.json');
    if (annotations !== null) A.validate(JSON.parse(annotations), seed.paperId, seed.version);
    return {notes, annotations};
  }
  const diskEqual = (a, b) => a.notes === b.notes && a.annotations === b.annotations;
  function showDiskConflict(current) {
    diskPending = current; $('disk-conflict').classList.remove('hidden'); report('folder-status', t('disk_changed'));
  }
  async function connect() {
    try {
      if (!window.showDirectoryPicker) { report('folder-status', t('folder_unsupported')); return; }
      const chosen = await window.showDirectoryPicker({mode: 'readwrite'});
      const current = await readDisk(chosen); folder = chosen;
      $('save-folder').disabled = false; $('reload-folder').disabled = false;
      if (!diskEqual(current, baseline)) showDiskConflict(current);
      else report('folder-status', t('folder_connected'));
    } catch (error) { report('folder-status', t(error.name === 'AbortError' ? 'folder_cancelled' : 'folder_failed') + (error.name === 'AbortError' ? '' : ' ' + error.message)); }
  }
  $('connect-folder').onclick = connect;
  if (!window.showDirectoryPicker) report('folder-status', t('folder_unsupported'));
  $('reload-folder').onclick = async () => {
    try { showDiskConflict(await readDisk(folder)); }
    catch (error) { report('folder-status', t('folder_failed') + ' ' + error.message); }
  };
  $('export-recovery').onclick = () => download(json({paper_id: seed.paperId, version: seed.version, recovery, current: {notes: editor.value, annotations: doc}, disk: diskPending}), 'reading-recovery.json', 'application/json');
  $('export-all-recovery').onclick = $('export-recovery').onclick;
  $('load-disk').onclick = () => {
    if (!diskPending) return;
    remember({notes: editor.value, annotations: doc, disk: diskPending}); previousText = editor.value;
    if (diskPending.notes !== null) editor.value = diskPending.notes;
    const incoming = diskPending.annotations === null ? {...A.clone(seed.annotations), annotations: []} : JSON.parse(diskPending.annotations);
    const result = A.merge(folderCaptureBase, doc, incoming); doc = result.doc; folderCaptureBase = A.clone(incoming);
    baseline = diskPending; diskPending = null; baseHash = seed.notesHash;
    $('disk-conflict').classList.add('hidden'); $('conflict').classList.add('hidden');
    showPrevious(); preserveRecovery(); saveNotesDraft(); saveCapturesDraft(); renderCaptures(); dirty();
    report('folder-status', t('disk_loaded')); report('annotation-status', t(result.conflicts ? 'capture_conflicts' : 'captures_merged'));
  };
  async function writeFile(directory, name, content) {
    const handle = await directory.getFileHandle(name, {create: true});
    const writable = await handle.createWritable();
    try { await writable.write(content); await writable.close(); }
    catch (error) { try { await writable.abort(); } catch (_) {} throw error; }
  }
  async function saveFolder() {
    if (!folder || busy) return;
    busy = true; $('save-folder').disabled = true;
    const perform = async () => {
      if (await folder.requestPermission({mode: 'readwrite'}) !== 'granted') throw Error(t('folder_denied'));
      const current = await readDisk(folder);
      if (!diskEqual(current, baseline)) { showDiskConflict(current); return; }
      if (diskPending) { showDiskConflict(current); return; }
      const snapshot = {notes: editor.value, annotations: json(doc)};
      remember({notes: current.notes, annotations_file: current.annotations}); preserveRecovery();
      const backups = await folder.getDirectoryHandle('.reading-backups', {create: true});
      await writeFile(backups, 'before-save-' + Date.now() + '-' + crypto.randomUUID() + '.json', json({paper_id: seed.paperId, version: seed.version, files: current}));
      // Recheck after preparing the backup. External editors cannot share a browser lock.
      const latest = await readDisk(folder);
      if (!diskEqual(latest, current)) { showDiskConflict(latest); return; }
      const saved = [];
      try {
        for (const [key, name] of [['notes', 'notes.md'], ['annotations', 'annotations.json']]) {
          // Recheck the remaining file immediately before each write.
          if (await readFile(folder, name) !== current[key]) throw Error(t('disk_changed'));
          await writeFile(folder, name, snapshot[key]); baseline[key] = snapshot[key]; saved.push(name);
        }
        folderCaptureBase = JSON.parse(snapshot.annotations); saveCapturesDraft();
        folderDirty = editor.value !== snapshot.notes || !A.same(doc.annotations, JSON.parse(snapshot.annotations).annotations);
        report('folder-status', t(folderDirty ? 'folder_newer_draft' : 'folder_saved'));
      } catch (error) {
        report('folder-status', t('folder_partial') + ' ' + (saved.join(', ') || t('none_saved')) + '. ' + error.message);
        return;
      }
    };
    try {
      // Serializes cooperating tabs on this origin. Pre-save comparison/backups
      // remain necessary for other origins and external agents.
      if (navigator.locks) await navigator.locks.request('cv-paper-save:' + JSON.stringify([seed.paperId, seed.version]), perform);
      else await perform();
    } catch (error) { report('folder-status', t('folder_failed') + ' ' + error.message); }
    finally { busy = false; $('save-folder').disabled = false; }
  }
  $('save-folder').onclick = saveFolder;

  const dialog = $('figure-dialog'), zoom = $('zoom-image'), sizeButton = $('actual-size');
  document.querySelectorAll('figure img').forEach(img => {
    img.closest('figure').setAttribute('data-enlarge-hint', t('enlarge_hint'));
    img.tabIndex = 0; img.setAttribute('role', 'button'); img.setAttribute('aria-label', t('enlarge_prefix') + img.alt);
    function open() { zoom.src = img.src; zoom.alt = img.alt; zoom.classList.remove('actual'); sizeButton.textContent = t('natural_size'); $('zoom-caption').textContent = img.closest('figure').querySelector('figcaption')?.textContent || ''; dialog.showModal(); }
    img.addEventListener('click', open); img.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
  });
  sizeButton.onclick = () => { const actual = zoom.classList.toggle('actual'); sizeButton.textContent = t(actual ? 'fit_view' : 'natural_size'); };
  $('close-figure').onclick = () => dialog.close();
  let disclosureState = null;
  window.addEventListener('beforeprint', () => {
    if (!disclosureState) disclosureState = [...document.querySelectorAll('[data-annotatable] details')].map(d => [d, d.open]);
    for (const [details] of disclosureState) details.open = true;
    $('print-notes').textContent = editor.value;
    $('print-captures').textContent = A.digest(doc, doc.annotations.filter(a => a.status !== 'archived'), states());
  });
  window.addEventListener('afterprint', () => { for (const [details, open] of disclosureState || []) details.open = open; disclosureState = null; });
  showPrevious(); renderCaptures(); updatePrompt();
})();
