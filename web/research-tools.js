(function () {
  'use strict';
  function safeName(value, fallback) {
    var name = String(value || '').normalize('NFC').replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').replace(/^[. ]+|[. ]+$/g, '').slice(0, 120);
    if (!name || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) return fallback || '未命名';
    return name;
  }
  function uniqueName(name, used, extension) {
    var candidate = name + extension, number = 2;
    while (used.has(candidate.toLocaleLowerCase())) candidate = name + ' (' + number++ + ')' + extension;
    used.add(candidate.toLocaleLowerCase());
    return candidate;
  }
  function markdownPaths(kb, folderId) {
    var folders = kb.folders || [], documents = kb.docs || [], directories = new Map(), usedDirectories = new Set(), usedFiles = new Map();
    directories.set('', uniqueName('未分类', usedDirectories, ''));
    folders.forEach(function (folder) { directories.set(String(folder.id), uniqueName(safeName(folder.title, '文件夹'), usedDirectories, '')); });
    return documents.filter(function (doc) { return folderId === 'all' || String(doc.folderId || '') === String(folderId); }).map(function (doc) {
      var directory = folderId === 'all' ? directories.get(String(doc.folderId || '')) || directories.get('') : '';
      if (!usedFiles.has(directory)) usedFiles.set(directory, new Set());
      return { path: (directory ? directory + '/' : '') + uniqueName(safeName(doc.title, '未命名文档'), usedFiles.get(directory), '.md'), content: String(doc.content || '') };
    });
  }
  var checkFields = ['label', 'original', 'reproduced', 'difference', 'explanation', 'status'];
  var checkStatuses = ['待核对', '一致', '存在差异', '无法复现'];
  function validateChecks(rows) {
    if (!Array.isArray(rows) || rows.length > 300) throw new Error('核对表最多支持300项');
    var ids = new Set();
    return rows.map(function (row) {
      if (!row || typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(row.id) || ids.has(row.id)) throw new Error('核对项编号无效或重复');
      ids.add(row.id);
      var clean = { id: row.id };
      checkFields.forEach(function (key) {
        if (typeof row[key] !== 'string' || row[key].length > (key === 'label' ? 300 : 10000)) throw new Error('核对项内容格式或长度无效');
        clean[key] = row[key];
      });
      if (checkStatuses.indexOf(clean.status) < 0) throw new Error('核对项状态无效');
      return clean;
    });
  }
  function replicationReport(item) {
    var lines = ['# ' + (item.title || '论文复现报告'), '', '## 论文信息', ''];
    [['作者', item.authors], ['DOI', item.doi], ['文献引用', item.citation], ['复现状态', item.status], ['运行环境', item.environment]].forEach(function (pair) { if (pair[1]) lines.push(pair[0] + '：' + pair[1], ''); });
    [['运行步骤', item.runOrder], ['复现结果', item.results]].forEach(function (pair) { lines.push('## ' + pair[0], '', pair[1] || '尚未填写', ''); });
    lines.push('## 逐项核对', '');
    (item.checks || []).forEach(function (row, index) {
      lines.push('### ' + (index + 1) + '. ' + (row.label || '未命名核对项'), '');
      [['原文结果', row.original], ['复现结果', row.reproduced], ['差异', row.difference], ['原因与说明', row.explanation], ['状态', row.status]].forEach(function (pair) { lines.push(pair[0] + '：' + (pair[1] || '尚未填写'), ''); });
    });
    if (!(item.checks || []).length) lines.push('尚未添加核对项', '');
    if (item.notes) lines.push('## 复现笔记', '', item.notes, '');
    return lines.join('\n');
  }
  function cvYear(item) {
    var details = item.details || {};
    var text = [item.year, details.year, details.time, item.publicationDate, item.publishedDate].filter(Boolean).join(' ');
    var match = String(text).match(/(?:19|20)\d{2}/);
    return match ? match[0] : '';
  }
  function cvItems(payload) {
    var result = [], seen = new Set(), pipeline = payload.researchHub || {}, cards = {}, fields = {};
    try { cards = JSON.parse(pipeline['research-hub-cards-v1'] || '{}') || {}; fields = JSON.parse(pipeline['research-hub-fields-v1'] || '{}') || {}; } catch (_) { /* Other CV categories remain exportable. */ }
    var published = Object.keys((cards.published || {}).added || {}).map(function (id) { return Object.assign({}, cards.published.added[id], fields[id] || {}); });
    published.concat(payload.publications || []).forEach(function (paper) {
      var doi = String(paper.doi || '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').trim().toLowerCase();
      var titleKey = String(paper.title || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
      if ((!doi && !titleKey) || (doi && seen.has('doi:' + doi)) || (titleKey && seen.has('title:' + titleKey))) return;
      if (doi) seen.add('doi:' + doi);
      if (titleKey) seen.add('title:' + titleKey);
      var year = cvYear(Object.assign({}, paper, { publicationDate: paper.publicationDate || paper.date }));
      result.push({ id: 'publications-' + result.length, kind: 'publications', year: year, title: paper.title || '未命名论文',
        text: [paper.authors, paper.title, paper.journal || paper.source, year, paper.volume, paper.issue, paper.pages, doi ? 'DOI ' + doi : ''].filter(Boolean).join(' · ') });
    });
    var records = payload.academicRecords || {};
    ['funding', 'awards', 'conferences'].forEach(function (kind) {
      (records[kind] || []).forEach(function (item, index) {
        var details = item.details || {};
        result.push({ id: kind + '-' + index, kind: kind, year: cvYear(item), title: item.title || '未命名记录',
          text: [item.title, item.meta, details.location, details.time, details.paper].filter(function (value, i, values) { return value && values.indexOf(value) === i; }).join(' · ') });
      });
    });
    return result.sort(function (a, b) { return b.year.localeCompare(a.year); });
  }
  var cvGroups = { publications: '已发表论文', funding: '基金项目', awards: '学术获奖', conferences: '学术会议' };
  function cvMarkdown(items, options) {
    var lines = ['# ' + (options.name ? options.name + ' · 学术简历' : '学术简历'), ''];
    if (options.affiliation) lines.push(options.affiliation, '');
    Object.keys(cvGroups).forEach(function (kind) {
      var records = items.filter(function (item) { return item.kind === kind; });
      if (!records.length) return;
      lines.push('## ' + cvGroups[kind], '');
      var year = null;
      records.forEach(function (item) {
        if (item.year !== year) { year = item.year; lines.push('### ' + (year || '未注明年份'), ''); }
        lines.push('- ' + item.text.replace(/\r?\n/g, '\n  '), '');
      });
    });
    return lines.join('\n');
  }
  function printableHtml(markdown) {
    var body = markdown.split('\n').map(function (line) {
      var heading = line.match(/^(#{1,3}) (.*)$/);
      var escape = function (text) { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
      if (heading) return '<h' + heading[1].length + '>' + escape(heading[2]) + '</h' + heading[1].length + '>';
      return line ? '<p>' + escape(line) + '</p>' : '';
    }).join('\n');
    return { body: body, document: '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>学术简历</title><style>body{max-width:820px;margin:40px auto;padding:0 24px;color:#222;font:15px/1.8 system-ui,sans-serif}h1{font-size:26px}h2{font-size:20px;border-bottom:1px solid #bbb;padding-bottom:5px}h3{font-size:16px}p{white-space:pre-wrap;overflow-wrap:anywhere}@page{size:A4;margin:20mm}@media print{body{margin:0;padding:0}h2,h3{break-after:avoid}}</style><body>' + body + '</body></html>' };
  }
  window.__academicResearchTools = { safeName: safeName, markdownPaths: markdownPaths, validateChecks: validateChecks,
    checkFields: checkFields, checkStatuses: checkStatuses, replicationReport: replicationReport, cvItems: cvItems, cvGroups: cvGroups, cvMarkdown: cvMarkdown, printableHtml: printableHtml };
})();
