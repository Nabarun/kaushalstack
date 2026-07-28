// Dependency-free document text extraction for partner doc-learning.
// Supports .txt/.md/.csv/.json (utf8) and .docx (a docx is a zip: walk the
// local file headers, inflate word/document.xml, strip the WordprocessingML).
import zlib from 'node:zlib';

export const DOC_MAX_BYTES = 8 * 1024 * 1024;
export const DOC_MAX_CHARS = 12000; // per document, what reaches the model

function decodeXmlEntities(s) {
    return s.replace(/&(amp|lt|gt|quot|apos|#\d+);/g, (m, e) => (
        { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e] ?? String.fromCodePoint(Number(e.slice(1)))
    ));
}

function docxText(buf) {
    let i = 0;
    while (i < buf.length - 30) {
        if (buf.readUInt32LE(i) !== 0x04034b50) break;
        const method = buf.readUInt16LE(i + 8);
        const flags = buf.readUInt16LE(i + 6);
        const compSize = buf.readUInt32LE(i + 18);
        const nameLen = buf.readUInt16LE(i + 26);
        const extraLen = buf.readUInt16LE(i + 28);
        const name = buf.subarray(i + 30, i + 30 + nameLen).toString();
        const dataStart = i + 30 + nameLen + extraLen;
        if (name === 'word/document.xml' && compSize > 0 && !(flags & 0x8)) {
            const raw = buf.subarray(dataStart, dataStart + compSize);
            const xml = (method === 8 ? zlib.inflateRawSync(raw) : raw).toString('utf8');
            return xml.split('</w:p>')
                .map((p) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((t) => decodeXmlEntities(t.replace(/<[^>]+>/g, ''))).join(''))
                .map((l) => l.trim()).filter(Boolean).join('\n');
        }
        if (compSize === 0) break; // streaming zip entry — sizes only in the data descriptor
        i = dataStart + compSize;
    }
    throw new Error('could not read this .docx — save it again from Word/Docs and retry, or paste the text.');
}

// { name, buf } -> { name, text, truncated }; throws with a friendly message.
export function extractDocText(name, buf) {
    const clean = String(name || 'document').slice(0, 140);
    if (!buf?.length) throw new Error('the file came through empty.');
    if (buf.length > DOC_MAX_BYTES) throw new Error('file is too large — keep it under 8 MB.');
    const ext = (clean.toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
    let text;
    if (['txt', 'md', 'csv', 'json'].includes(ext)) text = buf.toString('utf8');
    else if (ext === 'docx') text = docxText(buf);
    else throw new Error(`.${ext || '?'} files aren't supported yet — use .docx, .txt, .md or .csv (for a PDF, export it as text first).`);
    text = text.replace(/\u0000/g, '').trim();
    if (!text) throw new Error('no readable text found in the file.');
    return { name: clean, text: text.slice(0, DOC_MAX_CHARS), truncated: text.length > DOC_MAX_CHARS };
}
