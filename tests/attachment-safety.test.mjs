// attachment-safety.test.mjs: clicking an attachment must never run it as a page.
//
// Background (October 2026 audit): an attachment opened in a new tab from a
// blob: address, and such a page runs with Dash's own origin. An SVG (the file
// picker allows any image/*) or an HTML file can carry a script, and a script
// running there could read what Dash keeps on the device, the Dropbox sign-in
// included. The browser also trusted the content type stored with the file,
// which was copied from the file's own name or from synced or imported data.
//
// Promises tested here:
//   1. Only plain types (pictures, PDF, text) may open in a tab; everything
//      that can carry a script downloads instead.
//   2. A file that may open is handed over with a FIXED content type, whatever
//      type was stored with it.
//   3. Odd or hostile extensions ("constructor", "", upper case) are handled.
//   4. The editor really does build its attachment links this way.
import fs from 'node:fs';
import path from 'node:path';
import { resolveObjectURL } from 'node:buffer';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A pretend IndexedDB: just enough for blobs.js to store and fetch one record.
const data = new Map();
globalThis.indexedDB = {
  open() {
    const req = {};
    setTimeout(() => {
      req.result = {
        createObjectStore() {},
        transaction() {
          return {
            objectStore() {
              return {
                put(rec, key) {
                  const r = {};
                  setTimeout(() => { data.set(key, rec); r.onsuccess && r.onsuccess(); });
                  return r;
                },
                get(key) {
                  const r = {};
                  setTimeout(() => { r.result = data.get(key); r.onsuccess && r.onsuccess(); });
                  return r;
                },
              };
            },
          };
        },
      };
      req.onupgradeneeded && req.onupgradeneeded();
      req.onsuccess && req.onsuccess();
    });
    return req;
  },
};

const { openMimeForExt, blobOpenURL, attachmentLinkAttrs, putBlob } = await import('../js/blobs.js');

let fail = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) fail++;
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (cond ? '' : '\n      ' + extra));
};

console.log('\n--- only plain types may open in a tab ---');
for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'pdf', 'txt', 'md', 'markdown']) {
  ok(`"${ext}" may open in a tab`, !!openMimeForExt(ext));
}
for (const ext of ['svg', 'svgz', 'html', 'htm', 'xhtml', 'shtml', 'xml', 'xsl', 'js', 'mjs', 'json', 'php', 'swf', 'bin', 'exe']) {
  ok(`"${ext}" may NOT open in a tab`, openMimeForExt(ext) === null);
}

console.log('\n--- odd or hostile extensions ---');
for (const ext of ['', undefined, null, 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'png ', '.png', 'png/../html']) {
  ok(`${JSON.stringify(ext)} is not let through`, openMimeForExt(ext) === null);
}
ok('upper case is treated like lower case', openMimeForExt('PDF') === 'application/pdf' && openMimeForExt('PnG') === 'image/png');

console.log('\n--- links: open when plain, download when not ---');
{
  const pdf = attachmentLinkAttrs({ ext: 'pdf', name: 'plan.pdf', hash: 'abcdef123456' }, 'blob:x');
  ok('a PDF opens in a new tab', pdf.target === '_blank' && pdf.href === 'blob:x' && !('download' in pdf));
  ok('a new tab never gets a handle back to Dash', /noopener/.test(pdf.rel || ''));

  const svg = attachmentLinkAttrs({ ext: 'svg', name: 'logo.svg', hash: 'abcdef123456' }, 'blob:y');
  ok('an SVG downloads', svg.download === 'logo.svg' && svg.href === 'blob:y');
  ok('an SVG is NOT opened in a tab', !('target' in svg));

  const html = attachmentLinkAttrs({ ext: 'html', name: 'page.html', hash: 'abcdef123456' }, 'blob:z');
  ok('an HTML file downloads and is not opened', html.download === 'page.html' && !('target' in html));

  const nameless = attachmentLinkAttrs({ ext: 'svg', hash: 'abcdef123456' }, 'blob:n');
  ok('a nameless download gets a sensible file name', nameless.download === 'abcdef12.svg', String(nameless.download));

  const missing = attachmentLinkAttrs({ ext: 'png', name: 'a.png', hash: 'abcdef123456' }, null);
  ok('a missing file gives a harmless link', missing.href === '#');

  let threw = null;
  try { attachmentLinkAttrs(undefined, null); attachmentLinkAttrs({}, 'blob:q'); } catch (e) { threw = e.message; }
  ok('a damaged attachment record does not throw', !threw, threw || '');
}

console.log('\n--- a file that may open gets a FIXED content type ---');
{
  const bytes = new TextEncoder().encode('<html><script>alert(1)</script></html>').buffer;
  // The stored type lies: it says HTML, but the file is called a PDF.
  await putBlob('h-pdf', bytes, 'text/html');
  const url = await blobOpenURL('h-pdf', 'pdf');
  const blob = url && resolveObjectURL(url);
  ok('a PDF is served as a PDF, whatever type was stored', blob && blob.type === 'application/pdf', blob ? blob.type : String(url));

  await putBlob('h-md', bytes, 'text/html');
  const mdBlob = resolveObjectURL(await blobOpenURL('h-md', 'md'));
  ok('markdown is served as plain text', mdBlob && mdBlob.type.startsWith('text/plain'), mdBlob ? mdBlob.type : '');

  await putBlob('h-svg', bytes, 'image/svg+xml');
  ok('an SVG gets no tab URL at all', (await blobOpenURL('h-svg', 'svg')) === null);

  ok('a file that is not stored gives null, not an error', (await blobOpenURL('nope', 'pdf')) === null);
}

console.log('\n--- the editor builds its links this way ---');
{
  const editor = fs.readFileSync(path.join(ROOT, 'js/editor.js'), 'utf8');
  const chip = editor.slice(editor.indexOf('async function attachmentChip'));
  const chipBody = chip.slice(0, chip.indexOf('\n}\n') + 3);
  ok('the attachment chip builds its link with attachmentLinkAttrs', /attachmentLinkAttrs\(/.test(chipBody));
  ok('the chip does not hard-code a new-tab link', !/target:\s*["']_blank["']/.test(chipBody));
  ok('the chip uses the fixed-type URL for files that may open', /openMimeForExt\(/.test(chipBody) && /blobOpenURL\(/.test(chipBody));
}

console.log(fail ? `\n${fail} check(s) FAILED` : '\nAll attachment-safety checks passed');
process.exit(fail ? 1 : 0);
