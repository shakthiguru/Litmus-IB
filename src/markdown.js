// Minimal, safe Markdown -> HTML (escapes all input first). Supports headings, lists, tables,
// bold/italic/code, links, blockquotes and horizontal rules: enough for AI deliverables.

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\[(confirm|TBD|placeholder)[^\]]*\]/gi, (m) => `<mark>${m}</mark>`);
}

export function mdToHtml(md = '') {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      const n = m[1].length;
      out.push(`<h${n}>${inline(m[2])}</h${n}>`);
      i++;
    } else if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      out.push('<hr/>');
      i++;
    } else if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push('<table><thead><tr>' + head.map((h) => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>');
    } else if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ''));
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>` + items.map((x) => `<li>${inline(x)}</li>`).join('') + `</${tag}>`);
    } else if (/^>\s?/.test(line)) {
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${inline(q.join(' '))}</blockquote>`);
    } else {
      const p = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*([-*+]|\d+[.)])\s+|>|\s*\||-{3,}\s*$)/.test(lines[i])) p.push(lines[i++]);
      if (!p.length) p.push(lines[i++]);
      out.push(`<p>${p.map(inline).join('<br/>')}</p>`);
    }
  }
  return out.join('\n');
}

const DOC_CSS = `body{font-family:Calibri,Arial,sans-serif;max-width:820px;margin:40px auto;padding:0 24px;color:#1b1f2a;line-height:1.5}
h1{font-size:26px;color:#1f3d99;border-bottom:2px solid #1f3d99;padding-bottom:6px}h2{font-size:19px;color:#1f3d99;margin-top:28px}h3{font-size:16px}
table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #c9cfdc;padding:6px 10px;text-align:left}th{background:#eef2fb}
blockquote{border-left:3px solid #c9cfdc;margin:0;padding-left:12px;color:#555}mark{background:#fff3c4}code{background:#f1f3f8;padding:1px 4px}`;

export function docHtml(title, md) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${DOC_CSS}</style></head><body>${mdToHtml(md)}</body></html>`;
}

/** Deck markdown: slides separated by a line of ---, each starting with "# Title"; optional "Notes:" line. */
export function parseDeck(md = '') {
  return md
    .replace(/\r\n/g, '\n')
    .split(/\n-{3,}\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const lines = chunk.split('\n');
      const ti = lines.findIndex((l) => /^#{1,2}\s+/.test(l));
      const title = ti >= 0 ? lines[ti].replace(/^#{1,2}\s+/, '') : '';
      const rest = lines.filter((_, j) => j !== ti);
      const ni = rest.findIndex((l) => /^notes?:/i.test(l.trim()));
      const body = (ni >= 0 ? rest.slice(0, ni) : rest).join('\n').trim();
      const notes = ni >= 0 ? rest.slice(ni).join(' ').replace(/^notes?:\s*/i, '') : '';
      return { title, body, notes };
    });
}

export function deckHtml(title, md) {
  const slides = parseDeck(md);
  const sl = slides.map((s, i) => `<section class="slide${i === 0 ? ' cover' : ''}"><h1>${inline(s.title)}</h1><div class="body">${mdToHtml(s.body)}</div><div class="num">${i + 1} / ${slides.length}</div>${s.notes ? `<aside>${inline(s.notes)}</aside>` : ''}</section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#0d1117;font-family:Inter,Arial,sans-serif}
.slide{width:100vw;height:100vh;display:none;flex-direction:column;justify-content:center;padding:6vh 8vw;background:#fff;color:#1b1f2a;position:relative}
.slide.on{display:flex}.slide h1{font-size:4.2vh;color:#1f3d99;margin:0 0 3vh}.slide .body{font-size:2.6vh;line-height:1.5}.slide li{margin:1vh 0}
.slide table{border-collapse:collapse;font-size:2.2vh}.slide td,.slide th{border:1px solid #c9cfdc;padding:.8vh 1.2vw}
.cover{background:linear-gradient(135deg,#1f3d99,#2f6bff);color:#fff}.cover h1{color:#fff;font-size:6vh}
.num{position:absolute;right:3vw;bottom:3vh;font-size:1.6vh;opacity:.6}aside{display:none}
@media print{.slide{display:flex!important;page-break-after:always;height:100vh}}
</style></head><body>${sl}<script>
let i=0;const s=[...document.querySelectorAll('.slide')];const show=()=>s.forEach((x,j)=>x.classList.toggle('on',j===i));show();
addEventListener('keydown',e=>{if(['ArrowRight','PageDown',' '].includes(e.key))i=Math.min(i+1,s.length-1);if(['ArrowLeft','PageUp'].includes(e.key))i=Math.max(i-1,0);show()});
addEventListener('click',e=>{i=e.clientX>innerWidth/2?Math.min(i+1,s.length-1):Math.max(i-1,0);show()});
</script></body></html>`;
}
