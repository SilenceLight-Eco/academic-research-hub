(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SubmissionDeadlines = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function dateOnly(value) {
    var text = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || text.slice(0, 4) === '0000') return '';
    var date = new Date(text + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : '';
  }
  function isRevision(status) { return status === 'major_revision' || status === 'minor_revision'; }
  function dueAtForPaper(paper) {
    // Explicitly clearing the current deadline must not revive a previous round's deadline.
    if (paper.revisionDueAt != null) return dateOnly(paper.revisionDueAt);
    var history = Array.isArray(paper.history) ? paper.history : [];
    var last = history[history.length - 1];
    if (!last || (paper.currentJournal && String(paper.currentJournal).trim() !== String(last.journal || '').trim()) ||
        (paper.submissionDate && paper.submissionDate !== last.date)) return '';
    return dateOnly(last.revisionDueAt);
  }
  function evaluate(status, value, now) {
    var dueAt = dateOnly(value);
    var instant = now == null ? new Date() : new Date(now);
    if (!isRevision(status) || !dueAt || !Number.isFinite(instant.getTime())) return null;
    var parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
    var calendar = {};
    parts.forEach(function (part) { calendar[part.type] = part.value; });
    var today = calendar.year.padStart(4, '0') + '-' + calendar.month + '-' + calendar.day;
    var days = Math.round((Date.parse(dueAt + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
    return { dueAt: dueAt, days: days, kind: days < 0 ? 'overdue' : days <= 7 ? 'soon' : 'later',
      label: days < 0 ? '已逾期 ' + (-days) + ' 天' : days === 0 ? '今天截止' : '剩余 ' + days + ' 天' };
  }
  return { dateOnly: dateOnly, isRevision: isRevision, dueAtForPaper: dueAtForPaper, evaluate: evaluate };
});
