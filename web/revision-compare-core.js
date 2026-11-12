(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vendor/diff-9.0.0.min.js'));
  else root.RevisionCompareCore = factory(root.Diff);
})(typeof self !== 'undefined' ? self : this, function (Diff) {
  'use strict';
  var maxCharacters = 1000000;
  function validateText(value) {
    if (typeof value !== 'string' || value.length > maxCharacters) throw new Error('每个版本最多比较 100 万个字符，可按章节拆分后比较');
    value = value.replace(/\r\n?/g, '\n');
    if (value.split('\n').length > 10000) throw new Error('段落较多，请按章节拆分后比较');
    return value;
  }
  function tokens(oldText, newText, deadline) {
    var options = { timeout: Math.max(1, Math.min(200, deadline - Date.now())), maxEditLength: 2000 };
    var parts = /\p{Script=Han}/u.test(oldText + newText) ? Diff.diffChars(oldText, newText, options) : Diff.diffWordsWithSpace(oldText, newText, options);
    if (!parts) return { beforeParts: [{ text: oldText, type: 'removed' }], afterParts: [{ text: newText, type: 'added' }] };
    return {
      beforeParts: parts.filter(function (part) { return !part.added; }).map(function (part) { return { text: part.value, type: part.removed ? 'removed' : 'same' }; }),
      afterParts: parts.filter(function (part) { return !part.removed; }).map(function (part) { return { text: part.value, type: part.added ? 'added' : 'same' }; })
    };
  }
  function compare(before, after) {
    before = validateText(before); after = validateText(after);
    if (!before && !after) throw new Error('请先导入或粘贴需要比较的两个版本');
    var deadline = Date.now() + 6000;
    var oldParagraphs = before ? before.split('\n') : [], newParagraphs = after ? after.split('\n') : [];
    var chunks = Diff.diffArrays(oldParagraphs, newParagraphs, { timeout: 3500, maxEditLength: 5000 });
    if (!chunks) throw new Error('两个版本差异较大，请按章节拆分后比较');
    var rows = [], oldLine = 0, newLine = 0;
    for (var index = 0; index < chunks.length; index++) {
      if (Date.now() > deadline) throw new Error('比较耗时较长，请按章节拆分后重试');
      var chunk = chunks[index];
      if (!chunk.added && !chunk.removed) {
        chunk.value.forEach(function (line) { rows.push({ type: 'same', oldLine: ++oldLine, newLine: ++newLine, before: line, after: line }); });
        continue;
      }
      var removed = [], added = [];
      while (index < chunks.length && (chunks[index].added || chunks[index].removed)) {
        if (chunks[index].removed) removed = removed.concat(chunks[index].value);
        else added = added.concat(chunks[index].value);
        index++;
      }
      index--;
      for (var offset = 0; offset < Math.max(removed.length, added.length); offset++) {
        var hasOld = offset < removed.length, hasNew = offset < added.length;
        var oldText = hasOld ? removed[offset] : '', newText = hasNew ? added[offset] : '';
        rows.push({ type: hasOld && hasNew ? 'changed' : hasOld ? 'removed' : 'added',
          oldLine: hasOld ? ++oldLine : null, newLine: hasNew ? ++newLine : null,
          before: oldText, after: newText,
          ...(hasOld && hasNew ? tokens(oldText, newText, deadline) : {})
        });
      }
    }
    // An exact paragraph appearing once on each side can be identified as moved.
    var deleted = new Map(), inserted = new Map();
    rows.forEach(function (row) {
      if (row.type === 'removed' && row.before.trim().length >= 4) deleted.set(row.before, (deleted.get(row.before) || []).concat(row));
      if (row.type === 'added' && row.after.trim().length >= 4) inserted.set(row.after, (inserted.get(row.after) || []).concat(row));
    });
    var moved = 0;
    deleted.forEach(function (oldRows, value) {
      var newRows = inserted.get(value);
      if (oldRows.length === 1 && newRows && newRows.length === 1
        && oldParagraphs.filter(function (line) { return line === value; }).length === 1
        && newParagraphs.filter(function (line) { return line === value; }).length === 1) {
        oldRows[0].type = 'moved-from'; newRows[0].type = 'moved-to'; moved++;
      }
    });
    return { rows: rows, stats: {
      added: rows.filter(function (row) { return row.type === 'added'; }).length,
      removed: rows.filter(function (row) { return row.type === 'removed'; }).length,
      changed: rows.filter(function (row) { return row.type === 'changed'; }).length, moved: moved
    } };
  }
  function localName(node) { return String(node.localName || node.nodeName || '').split(':').pop(); }
  function children(node) { return Array.from(node.childNodes || []).filter(function (child) { return child.nodeType === 1; }); }
  function wordText(node) {
    var name = localName(node);
    if (['del', 'instrText', 'delText'].indexOf(name) >= 0) return '';
    if (name === 't') return node.textContent || '';
    if (name === 'tab') return '\t';
    if (name === 'br' || name === 'cr') return '\n';
    return children(node).map(wordText).join('');
  }
  function wordBlocks(node) {
    var name = localName(node);
    if (name === 'p') return [wordText(node)];
    if (name === 'tbl') return children(node).filter(function (child) { return localName(child) === 'tr'; }).map(function (row) {
      return children(row).filter(function (child) { return localName(child) === 'tc'; }).map(function (cell) { return children(cell).flatMap(wordBlocks).join('\n'); }).join('\t');
    });
    if (name === 'del') return [];
    return children(node).flatMap(wordBlocks);
  }
  function extractDocx(xml, Parser) {
    var doc = new Parser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Word 正文结构损坏，无法读取');
    var body = children(doc.documentElement).find(function (node) { return localName(node) === 'body'; });
    if (!body || localName(doc.documentElement) !== 'document') throw new Error('文件没有有效的 Word 正文');
    return validateText(wordBlocks(body).join('\n'));
  }
  function escape(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]; }); }
  function highlighted(row, side) {
    var parts = row[side + 'Parts'];
    if (!parts) return escape(row[side]);
    return parts.map(function (part) { return part.type === 'same' ? escape(part.text) : '<mark class="rc-' + part.type + '">' + escape(part.text) + '</mark>'; }).join('');
  }
  function rowHtml(row, index) {
    var labels = { same: '未修改', added: '新增', removed: '删除', changed: '修改', 'moved-from': '移出', 'moved-to': '移入' };
    return '<div class="rc-row rc-row-' + row.type + '" data-rc-row="' + index + '"' + (row.type === 'same' ? '' : ' data-rc-change tabindex="-1"') + '>' +
      ['before', 'after'].map(function (side) {
        var number = side === 'before' ? row.oldLine : row.newLine;
        return '<div class="rc-cell"><span class="rc-line">' + (number || '') + '</span><div class="rc-paragraph">' + highlighted(row, side) + '</div></div>';
      }).join('') + '<span class="rc-kind">' + labels[row.type] + '</span></div>';
  }
  function report(result, info) {
    return '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'"><title>论文版本对比</title><style>body{font:15px/1.8 system-ui,sans-serif;color:#202624;margin:30px}.rc-row{display:grid;grid-template-columns:1fr 1fr;position:relative;border-bottom:1px solid #ddd;break-inside:avoid}.rc-cell{display:flex;gap:12px;padding:14px;min-width:0}.rc-paragraph{white-space:pre-wrap;overflow-wrap:anywhere}.rc-line{color:#666;font-size:11px}.rc-kind{position:absolute;right:4px;top:0;font-size:10px;color:#555}.rc-added,.rc-row-added{background:#e0f4e8}.rc-removed,.rc-row-removed{background:#fce4e4}.rc-removed{text-decoration:line-through}.rc-row-changed{background:#fff9de}.rc-row-moved-from,.rc-row-moved-to{background:#e9edff}mark{color:inherit}.rc-heading{display:grid;grid-template-columns:1fr 1fr;gap:20px}</style><h1>' + escape(info.title) + '</h1><p>' + escape(info.roundLabel) + ' · ' + escape(info.time) + '</p><p>新增 ' + result.stats.added + ' · 删除 ' + result.stats.removed + ' · 修改 ' + result.stats.changed + ' · 移动 ' + result.stats.moved + ' 段</p><div class="rc-heading"><h2>' + escape(info.beforeName) + '</h2><h2>' + escape(info.afterName) + '</h2></div>' + result.rows.map(rowHtml).join('') + '</html>';
  }
  return { compare: compare, extractDocx: extractDocx, validateText: validateText, escape: escape, rowHtml: rowHtml, report: report, maxCharacters: maxCharacters };
});
