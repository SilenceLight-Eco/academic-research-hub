(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AcademicReferenceExport = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function normalizeDoi(value) {
    return String(value || '').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  }

  function clean(value) {
    return String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function authors(value) {
    return String(value || '').split(/[;；\n]+/).map(clean).filter(Boolean);
  }

  function bibtexEscape(value) {
    return String(value == null ? '' : value).replace(/\\/g, '\\textbackslash{}').replace(/([{}#$%&_])/g, '\\$1').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}');
  }

  function citationKey(item, used) {
    var author = clean(item.authors).split(/[;；\n]/)[0] || 'anonymous';
    var year = clean(item.year) || 'nd';
    var base = (author + year).replace(/[^\w\u4e00-\u9fff-]/g, '') || 'reference';
    var count = (used[base] || 0) + 1;
    used[base] = count;
    return base + (count > 1 ? '_' + count : '');
  }

  function locatorFields(value) {
    var text = clean(value), match = text.match(/^(.+?)\s*\(([^)]+)\)\s*[,;]?\s*(?:(?:pp?\.?|pages?)\s*)?(\d+)\s*[-–—]\s*(\d+)$/i);
    if (match) return { volume: clean(match[1]), issue: clean(match[2]), start: match[3], end: match[4] };
    match = text.match(/^(?:(?:pp?\.?|pages?)\s*)?(\d+)\s*[-–—]\s*(\d+)$/i);
    if (match) return { start: match[1], end: match[2] };
    match = text.match(/^(?:(?:pp?\.?|pages?)\s*)?(\d+)$/i);
    if (match) return { start: match[1] };
    return text ? { raw: text } : {};
  }

  function toBibtex(items) {
    var typeMap = { '期刊论文': 'article', '书籍': 'book', '会议论文': 'inproceedings', '报告': 'techreport', '网页': 'misc' };
    var used = Object.create(null);
    return items.map(function (item) {
      var type = typeMap[item.type] || 'misc';
      var locator = locatorFields(item.locator);
      var fields = [
        ['author', authors(item.authors).join(' and ')], ['title', item.title], ['year', item.year],
        [type === 'book' ? 'publisher' : type === 'inproceedings' ? 'booktitle' : type === 'techreport' ? 'institution' : 'journal', item.source],
        ['volume', locator.volume], ['number', locator.issue], ['pages', locator.start && locator.end ? locator.start + '--' + locator.end : locator.start || locator.raw],
        ['doi', normalizeDoi(item.doi)], ['url', item.url]
      ].filter(function (field) { return clean(field[1]); });
      return '@' + type + '{' + citationKey(item, used) + ',\n' + fields.map(function (field) { return '  ' + field[0] + ' = {' + bibtexEscape(clean(field[1])) + '}'; }).join(',\n') + '\n}';
    }).join('\n\n');
  }

  function toRis(items) {
    var typeMap = { '期刊论文': 'JOUR', '书籍': 'BOOK', '会议论文': 'CONF', '报告': 'RPRT', '网页': 'ELEC' };
    return items.map(function (item) {
      var lines = ['TY  - ' + (typeMap[item.type] || 'GEN')];
      var locator = locatorFields(item.locator);
      authors(item.authors).forEach(function (author) { lines.push('AU  - ' + clean(author)); });
      if (clean(item.title)) lines.push('TI  - ' + clean(item.title));
      if (clean(item.source)) lines.push((item.type === '书籍' || item.type === '报告' ? 'PB' : item.type === '会议论文' || item.type === '网页' ? 'T2' : 'JO') + '  - ' + clean(item.source));
      if (clean(item.year)) lines.push('PY  - ' + clean(item.year));
      if (locator.volume) lines.push('VL  - ' + locator.volume);
      if (locator.issue) lines.push('IS  - ' + locator.issue);
      if (locator.start) lines.push('SP  - ' + locator.start);
      if (locator.end) lines.push('EP  - ' + locator.end);
      if (locator.raw) lines.push('M1  - ' + locator.raw);
      if (normalizeDoi(item.doi)) lines.push('DO  - ' + normalizeDoi(item.doi));
      if (clean(item.url)) lines.push('UR  - ' + clean(item.url));
      else if (normalizeDoi(item.doi)) lines.push('UR  - https://doi.org/' + normalizeDoi(item.doi));
      if (clean(item.abstract)) lines.push('AB  - ' + clean(item.abstract));
      [item.keywords, item.tags].filter(Boolean).join(';').split(/[;,，；\n]+/).map(clean).filter(Boolean).forEach(function (keyword) { lines.push('KW  - ' + keyword); });
      lines.push('ER  - ');
      return lines.join('\n');
    }).join('\n\n');
  }

  function filename(folderName, extension, date) {
    var label = clean(folderName || '文献库').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, '-').slice(0, 60) || '文献库';
    return label + '-' + (date || new Date().toISOString().slice(0, 10)) + '.' + String(extension || '').replace(/^\./, '');
  }

  return { toBibtex: toBibtex, toRis: toRis, filename: filename };
});
