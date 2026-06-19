import { deflateRawSync } from "node:zlib";

export type DocxFixtureInput = {
  documentXml: string;
  media?: Array<{ path: string; content: Buffer }>;
};

export function createDocxFixture(input: DocxFixtureInput): Buffer {
  const files = new Map<string, Buffer>([
    ["[Content_Types].xml", Buffer.from("<Types></Types>")],
    ["word/document.xml", Buffer.from(input.documentXml)],
  ]);
  for (const media of input.media ?? []) {
    files.set(media.path, media.content);
  }
  return createZipFixture(files);
}

export function createTextPdfFixture(text: string): Buffer {
  return Buffer.from(`%PDF-1.7\nBT\n(${escapePdfLiteral(text)}) Tj\nET`);
}

export function createValidTextPdfFixture(text: string): Buffer {
  const escapedText = escapePdfLiteral(text);
  const stream = `BT /F1 18 Tf 72 720 Td (${escapedText}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  const parts = ["%PDF-1.7\n"];
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(parts.join("")));
    parts.push(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`);
  }
  const xrefOffset = Buffer.byteLength(parts.join(""));
  parts.push(`xref\n0 ${objects.length + 1}\n`);
  parts.push("0000000000 65535 f \n");
  for (const offset of offsets.slice(1)) {
    parts.push(`${offset.toString().padStart(10, "0")} 00000 n \n`);
  }
  parts.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return Buffer.from(parts.join(""));
}

export function createScannedPdfFixture(): Buffer {
  return Buffer.from("%PDF-1.7\nstream\nendstream");
}

export function createCorruptedFileFixture(): Buffer {
  return Buffer.from("not a valid resume file");
}

function createZipFixture(files: Map<string, Buffer>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of files) {
    const nameBuffer = Buffer.from(name);
    const compressed = deflateRawSync(content);
    const local = Buffer.alloc(30 + nameBuffer.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    nameBuffer.copy(local, 30);
    localParts.push(local, compressed);

    const central = Buffer.alloc(46 + nameBuffer.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuffer.copy(central, 46);
    centralParts.push(central);

    offset += local.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.size, 8);
  end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function escapePdfLiteral(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\n/g, "\\n");
}
