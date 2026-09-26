const assert = require('node:assert/strict');
const test = require('node:test');
const exporter = require('../web/reference-export.js');

test('BibTeX export escapes special characters and creates unique keys', () => {
  const text = exporter.toBibtex([
    { type: '期刊论文', authors: 'Smith, John; 王小明', title: 'R&D_effects 100%', year: '2024', source: 'Journal & Policy', locator: '12(3), 45–68', doi: 'https://doi.org/10.1234/example' },
    { type: '期刊论文', authors: 'Smith, John; 王小明', title: 'Second paper', year: '2024' }
  ]);

  assert.match(text, /^@article\{SmithJohn2024,/);
  assert.match(text, /author = \{Smith, John and 王小明\}/);
  assert.match(text, /title = \{R\\&D\\_effects 100\\%\}/);
  assert.match(text, /journal = \{Journal \\& Policy\}/);
  assert.match(text, /volume = \{12\}/);
  assert.match(text, /number = \{3\}/);
  assert.match(text, /pages = \{45--68\}/);
  assert.match(text, /doi = \{10\.1234\/example\}/);
  assert.match(text, /@article\{SmithJohn2024_2,/);
});

test('RIS export preserves authors, DOI, URL, abstract and keywords', () => {
  const text = exporter.toRis([{
    type: '会议论文', authors: '王小明；Smith, John', title: 'Research findings', year: '2025',
    source: 'Academic Conference', locator: '12(3), 45–68', doi: 'doi:10.5555/abc',
    abstract: 'A useful abstract.', keywords: 'policy; innovation'
  }]);

  assert.match(text, /^TY  - CONF/m);
  assert.match(text, /AU  - 王小明/);
  assert.match(text, /AU  - Smith, John/);
  assert.match(text, /T2  - Academic Conference/);
  assert.match(text, /VL  - 12/);
  assert.match(text, /IS  - 3/);
  assert.match(text, /SP  - 45/);
  assert.match(text, /EP  - 68/);
  assert.match(text, /DO  - 10\.5555\/abc/);
  assert.match(text, /UR  - https:\/\/doi\.org\/10\.5555\/abc/);
  assert.match(text, /KW  - innovation/);
  assert.match(text, /ER  - $/);
});

test('export filenames include the folder label and sanitize unsafe characters', () => {
  assert.equal(exporter.filename('政策/创新', 'ris', '2026-09-27'), '政策-创新-2026-09-27.ris');
});
