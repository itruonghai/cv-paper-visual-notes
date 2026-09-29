/* Portable capture model. No network, UI, filesystem, or model calls. */
(() => {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const canonical = value => JSON.stringify(value, function (_, item) {
    return item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item;
  });
  const same = (a, b) => canonical(a) === canonical(b);
  const id = () => 'ann-' + crypto.randomUUID();
  function validate(doc, paperId, version) {
    if (!doc || doc.schema_version !== 1) throw Error('Unsupported annotation schema. Keep the original file and use a compatible reader.');
    if (doc.paper_id !== paperId || doc.version !== version) throw Error('Annotations belong to a different paper/version.');
    if (!Array.isArray(doc.annotations)) throw Error('Missing annotations list.');
    const ids = new Set();
    for (const a of doc.annotations) {
      if (!a || typeof a.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(a.id) || ids.has(a.id)) throw Error('Duplicate or invalid annotation ID.');
      ids.add(a.id);
      for (const key of ['section_id', 'section_title', 'content_revision', 'comment', 'created_at', 'updated_at']) {
        if (typeof a[key] !== 'string') throw Error('Missing annotation field: ' + key);
      }
      if (!['text', 'figure'].includes(a.kind) || !['open', 'resolved', 'archived'].includes(a.status)) throw Error('Unsupported annotation kind/status.');
      if (!Array.isArray(a.tags) || a.tags.some(tag => typeof tag !== 'string')) throw Error('Invalid tags.');
      if (!a.source || !['notebook-prose', 'original-caption', 'paper-passage', 'user-note', 'figure'].includes(a.source.kind) || typeof a.source.ref !== 'string') throw Error('Invalid source identity.');
      const fields = a.kind === 'text' ? ['exact', 'prefix', 'suffix'] : ['figure_id', 'fingerprint', 'caption'];
      if (!a.target || fields.some(key => typeof a.target[key] !== 'string') || (a.kind === 'text' && !a.target.exact)) throw Error('Invalid annotation target.');
    }
    return doc;
  }
  function touch(doc) {
    doc.revision = crypto.randomUUID();
    doc.updated_at = new Date().toISOString();
    return doc;
  }
  // Three-way merge. A concurrent edit to the same record is retained as a
  // separately identified capture; timestamps never decide whose words survive.
  function merge(base, local, incoming) {
    validate(incoming, local.paper_id, local.version);
    const merged = clone(local), records = merged.annotations;
    const baseById = new Map((base?.annotations || []).map(a => [a.id, a]));
    let conflicts = 0;
    const content = a => { const copy = clone(a); delete copy.id; delete copy.conflict_of; return copy; };
    for (const other of incoming.annotations) {
      const index = records.findIndex(a => a.id === other.id);
      if (index < 0) { records.push(clone(other)); continue; }
      const own = records[index], before = baseById.get(other.id);
      if (same(own, other) || (before && same(other, before))) continue;
      if (before && same(own, before)) { records[index] = clone(other); continue; }
      if (records.some(a => a.conflict_of === other.id && same(content(a), content(other)))) continue;
      records.push({...clone(other), id: id(), conflict_of: other.id});
      conflicts++;
    }
    return {doc: touch(merged), conflicts};
  }
  // Offsets are used only within the identical section revision. On rewritten
  // sections prefer a unique exact match with unchanged context. A unique exact
  // match whose context changed on one side only (a nearby wording fix) stays
  // attached with drifted: true so the reader can confirm it.
  const NEAR = 8;
  function locate(text, target, sameRevision) {
    if (sameRevision && Number.isInteger(target.start) && text.slice(target.start, target.end) === target.exact) {
      return {start: target.start, end: target.end};
    }
    const hits = [], occurrences = [];
    for (let at = text.indexOf(target.exact); at !== -1; at = text.indexOf(target.exact, at + 1)) {
      occurrences.push(at);
      const prefixOK = !target.prefix || text.slice(Math.max(0, at - target.prefix.length), at) === target.prefix;
      const end = at + target.exact.length;
      const suffixOK = !target.suffix || text.slice(end, end + target.suffix.length) === target.suffix;
      if (prefixOK && suffixOK) hits.push({start: at, end});
    }
    if (hits.length) return hits.length === 1 ? hits[0] : null;
    if (occurrences.length !== 1) return null;
    const start = occurrences[0], end = start + target.exact.length;
    const before = Math.min(NEAR, target.prefix.length), after = Math.min(NEAR, target.suffix.length);
    const prefixNear = before ? text.slice(Math.max(0, start - before), start) === target.prefix.slice(-before) : start === 0;
    const suffixNear = after ? text.slice(end, end + after) === target.suffix.slice(0, after) : end === text.length;
    return prefixNear || suffixNear ? {start, end, drifted: true} : null;
  }
  function digest(doc, items = doc.annotations, states = {}) {
    let text = '# Reading captures — ' + doc.paper_id + ' (' + doc.version + ')\n\n';
    text += 'Verbatim captures and reader comments; not an AI synthesis.\n';
    for (const a of items) {
      text += '\n## ' + a.id + ' — ' + a.section_title + '\n\n';
      text += '- Status: ' + a.status + (states[a.id] === false ? '; needs reattachment' : states[a.id] === 'check' ? '; target changed, reader should confirm' : '') + '\n';
      text += '- Tags: ' + (a.tags.join(', ') || 'none') + '\n';
      text += '- Origin: ' + a.source.kind + '\n- Reference: ' + a.source.ref + '\n';
      text += '- Location: #' + (a.kind === 'figure' ? a.target.figure_id : a.section_id) + '\n';
      text += '- Captured: ' + a.created_at + '; updated: ' + a.updated_at + '\n';
      if (a.conflict_of) text += '- Conflicting edit of: ' + a.conflict_of + ' (both retained)\n';
      const excerpt = a.kind === 'text' ? a.target.exact : a.target.caption;
      text += '\n' + excerpt.split('\n').map(line => '> ' + line).join('\n') + '\n';
      if (a.comment) text += '\nReader comment:\n\n' + a.comment + '\n';
    }
    return text;
  }
  const api = {clone, same, id, touch, validate, merge, locate, digest};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.CvAnnotations = api;
})();
