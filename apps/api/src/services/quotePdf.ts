import { deflateSync, inflateSync } from "node:zlib";
import { readFile } from "node:fs/promises";

type PdfQuoteItem = {
  code: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  total: string;
};

export type QuotePdfData = {
  number: string;
  issueDate: Date | string;
  validityDate: Date | string;
  generatedAt: Date | string;
  generatedBy: string;
  company: { legalName: string; tradeName?: string | null; cnpj: string; email?: string | null; phone?: string | null; addressLine?: string | null; city?: string | null; state?: string | null; zipCode?: string | null };
  unit?: { name: string } | null;
  customer: { legalName: string; tradeName?: string | null; document?: string | null; addressLine?: string | null; city?: string | null; state?: string | null; zipCode?: string | null; phone?: string | null; email?: string | null; responsibleContact?: string | null };
  commercialOwner?: string | null;
  paymentTerms?: string | null;
  deliveryForecast?: string | null;
  commercialNotes?: string | null;
  notes?: string | null;
  items: PdfQuoteItem[];
  subtotal: string;
  discountTotal: string;
  surchargeTotal: string;
  total: string;
};

type PngImage = { width: number; height: number; rgb: Buffer; alpha?: Buffer };

function parsePng(input: Buffer): PngImage {
  if (!input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("Logo oficial invalido");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset < input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.toString("ascii", offset + 4, offset + 8);
    const data = input.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error("Logo PNG entrelacado nao suportado");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colorType)) throw new Error("Formato do logo oficial nao suportado");
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const source = inflateSync(Buffer.concat(idat));
  const decoded = Buffer.alloc(height * stride);
  let sourceOffset = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = source[sourceOffset++];
    const rowOffset = row * stride;
    for (let column = 0; column < stride; column += 1) {
      const raw = source[sourceOffset++];
      const left = column >= channels ? decoded[rowOffset + column - channels] : 0;
      const up = row > 0 ? decoded[rowOffset - stride + column] : 0;
      const upLeft = row > 0 && column >= channels ? decoded[rowOffset - stride + column - channels] : 0;
      let value = raw;
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      } else if (filter !== 0) throw new Error("Filtro PNG nao suportado");
      decoded[rowOffset + column] = value & 255;
    }
  }
  const rgb = Buffer.alloc(width * height * 3);
  const alpha = colorType === 6 ? Buffer.alloc(width * height) : undefined;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgb[pixel * 3] = decoded[pixel * channels];
    rgb[pixel * 3 + 1] = decoded[pixel * channels + 1];
    rgb[pixel * 3 + 2] = decoded[pixel * channels + 2];
    if (alpha) alpha[pixel] = decoded[pixel * channels + 3];
  }
  return { width, height, rgb: deflateSync(rgb), alpha: alpha ? deflateSync(alpha) : undefined };
}

function pdfText(value: unknown): string {
  const normalized = String(value ?? "-").normalize("NFC");
  return [...Buffer.from(normalized, "latin1")].map((byte) => {
    if (byte === 40 || byte === 41 || byte === 92) return `\\${String.fromCharCode(byte)}`;
    if (byte < 32 || byte > 126) return `\\${byte.toString(8).padStart(3, "0")}`;
    return String.fromCharCode(byte);
  }).join("");
}

function brDate(value: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

function brDateTime(value: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

function currency(value: string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

function splitText(value: string, max: number): string[] {
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  for (const word of words) {
    const candidate = lines.length ? `${lines.at(-1)} ${word}` : word;
    if (candidate.length <= max) {
      if (lines.length) lines[lines.length - 1] = candidate;
      else lines.push(candidate);
    } else lines.push(word.slice(0, max));
  }
  return lines.length ? lines.slice(0, 2) : ["-"];
}

function text(command: string[], x: number, y: number, value: unknown, size = 9, bold = false, align: "left" | "right" = "left") {
  const safe = pdfText(value);
  const estimatedWidth = String(value ?? "").length * size * 0.56;
  const tx = align === "right" ? x - estimatedWidth : x;
  command.push(`BT /F1 ${size} Tf ${bold ? "0.1 0.16 0.24" : "0.17 0.24 0.33"} rg 1 0 0 1 ${tx.toFixed(2)} ${y.toFixed(2)} Tm (${safe}) Tj ET`);
}

function line(command: string[], x1: number, y1: number, x2: number, y2: number, gray = 0.84) {
  command.push(`${gray} G 0.5 w ${x1} ${y1} m ${x2} ${y2} l S`);
}

function rect(command: string[], x: number, y: number, width: number, height: number, color: string) {
  command.push(`${color} rg ${x} ${y} ${width} ${height} re f`);
}

export async function createQuotePdf(data: QuotePdfData, logoPath: string): Promise<Buffer> {
  const logo = parsePng(await readFile(logoPath));
  const pages: string[][] = [];
  let commands: string[] = [];
  let cursor = 0;
  const startPage = (continuation: boolean) => {
    commands = [];
    rect(commands, 0, 0, 595, 842, "1 1 1");
    commands.push(`q 176 0 0 ${(176 * logo.height / logo.width).toFixed(2)} 38 744 cm /Logo Do Q`);
    text(commands, 557, 803, "ESPELHO DO PEDIDO", 17, true, "right");
    text(commands, 557, 783, data.number, 11, true, "right");
    text(commands, 557, 766, `Emissao: ${brDate(data.issueDate)}  Validade: ${brDate(data.validityDate)}`, 8, false, "right");
    line(commands, 38, 735, 557, 735, 0.62);
    if (continuation) {
      text(commands, 38, 717, "ITENS DO ORCAMENTO - CONTINUACAO", 10, true);
      cursor = 690;
    } else cursor = 714;
  };
  const tableHeader = () => {
    rect(commands, 38, cursor - 17, 519, 20, "0.91 0.94 0.97");
    const headers: Array<[number, string]> = [[42, "Codigo"], [92, "Descricao"], [282, "Un."], [316, "Qtd."], [366, "V. unit."], [432, "Desc."], [494, "Total"]];
    for (const [x, label] of headers) text(commands, x, cursor - 11, label, 7, true);
    cursor -= 24;
  };
  startPage(false);
  text(commands, 38, cursor, data.company.tradeName || data.company.legalName, 11, true);
  text(commands, 38, cursor - 15, `${data.company.legalName} - CNPJ ${data.company.cnpj}`, 8);
  text(commands, 38, cursor - 29, [data.company.addressLine, data.company.city, data.company.state, data.company.phone, data.company.email].filter(Boolean).join(" - "), 8);
  cursor -= 53;
  rect(commands, 38, cursor - 55, 519, 60, "0.965 0.975 0.985");
  text(commands, 46, cursor - 12, "CLIENTE", 9, true);
  text(commands, 46, cursor - 28, data.customer.tradeName || data.customer.legalName, 10, true);
  text(commands, 46, cursor - 43, `${data.customer.legalName}${data.customer.document ? ` - CPF/CNPJ ${data.customer.document}` : ""}`, 8);
  text(commands, 320, cursor - 28, [data.customer.phone, data.customer.email].filter(Boolean).join(" - "), 8);
  text(commands, 320, cursor - 43, [data.customer.addressLine, data.customer.city, data.customer.state].filter(Boolean).join(" - "), 8);
  cursor -= 75;
  text(commands, 38, cursor, "INFORMACOES COMERCIAIS", 9, true);
  text(commands, 38, cursor - 16, `Responsavel: ${data.commercialOwner || data.generatedBy}`, 8);
  text(commands, 300, cursor - 16, `Empresa/unidade: ${data.company.tradeName || data.company.legalName}${data.unit ? ` / ${data.unit.name}` : ""}`, 8);
  text(commands, 38, cursor - 30, `Pagamento: ${data.paymentTerms || "Nao informado"}`, 8);
  text(commands, 300, cursor - 30, `Entrega: ${data.deliveryForecast || "Nao informada"}`, 8);
  cursor -= 53;
  tableHeader();
  for (const item of data.items) {
    const description = splitText(item.description, 40);
    const rowHeight = description.length > 1 ? 29 : 21;
    if (cursor - rowHeight < 108) {
      pages.push(commands);
      startPage(true);
      tableHeader();
    }
    line(commands, 38, cursor + 4, 557, cursor + 4);
    text(commands, 42, cursor - 9, item.code, 7);
    text(commands, 92, cursor - 9, description[0], 7);
    if (description[1]) text(commands, 92, cursor - 19, description[1], 7);
    text(commands, 282, cursor - 9, item.unit, 7);
    text(commands, 353, cursor - 9, item.quantity, 7, false, "right");
    text(commands, 426, cursor - 9, currency(item.unitPrice), 7, false, "right");
    text(commands, 488, cursor - 9, currency(item.discount), 7, false, "right");
    text(commands, 552, cursor - 9, currency(item.total), 7, true, "right");
    cursor -= rowHeight;
  }
  if (cursor < 205) {
    pages.push(commands);
    startPage(true);
    cursor = 675;
  }
  line(commands, 340, cursor, 557, cursor, 0.55);
  const totals: Array<[string, string, boolean]> = [
    ["Subtotal", currency(data.subtotal), false],
    ["Descontos", currency(data.discountTotal), false],
    ["Acrescimos", currency(data.surchargeTotal), false],
    ["VALOR TOTAL", currency(data.total), true]
  ];
  for (const [label, value, bold] of totals) {
    cursor -= 18;
    text(commands, 350, cursor, label, bold ? 10 : 8, bold);
    text(commands, 552, cursor, value, bold ? 11 : 8, bold, "right");
  }
  cursor -= 28;
  text(commands, 38, cursor, "OBSERVACOES", 9, true);
  for (const [index, note] of splitText([data.commercialNotes, data.notes].filter(Boolean).join(" - ") || "Sem observacoes.", 100).entries()) text(commands, 38, cursor - 15 - index * 12, note, 8);
  pages.push(commands);

  const objectBuffers: Buffer[] = [Buffer.alloc(0), Buffer.alloc(0), Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "ascii")];
  let alphaObjectId: number | undefined;
  if (logo.alpha) {
    alphaObjectId = objectBuffers.length + 1;
    objectBuffers.push(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${logo.alpha.length} >>\nstream\n`, "ascii"), logo.alpha, Buffer.from("\nendstream", "ascii")]));
  }
  const logoObjectId = objectBuffers.length + 1;
  objectBuffers.push(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode${alphaObjectId ? ` /SMask ${alphaObjectId} 0 R` : ""} /Length ${logo.rgb.length} >>\nstream\n`, "ascii"), logo.rgb, Buffer.from("\nendstream", "ascii")]));
  const pageIds: number[] = [];
  pages.forEach((pageCommands, index) => {
    const footer = [...pageCommands];
    line(footer, 38, 54, 557, 54, 0.75);
    text(footer, 38, 39, `Gerado em ${brDateTime(data.generatedAt)} por ${data.generatedBy}`, 7);
    text(footer, 557, 39, `Pagina ${index + 1} de ${pages.length}`, 7, false, "right");
    const stream = Buffer.from(footer.join("\n"), "ascii");
    const contentId = objectBuffers.length + 1;
    objectBuffers.push(Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, "ascii"), stream, Buffer.from("\nendstream", "ascii")]));
    const pageId = objectBuffers.length + 1;
    pageIds.push(pageId);
    objectBuffers.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> /XObject << /Logo ${logoObjectId} 0 R >> >> /Contents ${contentId} 0 R >>`, "ascii"));
  });
  objectBuffers[0] = Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "ascii");
  objectBuffers[1] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`, "ascii");
  const header = Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "binary");
  const parts: Buffer[] = [header];
  const offsets = [0];
  let length = header.length;
  objectBuffers.forEach((object, index) => {
    offsets.push(length);
    const wrapped = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`, "ascii"), object, Buffer.from("\nendobj\n", "ascii")]);
    parts.push(wrapped);
    length += wrapped.length;
  });
  const xrefOffset = length;
  const xref = [`xref`, `0 ${objectBuffers.length + 1}`, "0000000000 65535 f "];
  for (let index = 1; index <= objectBuffers.length; index += 1) xref.push(`${String(offsets[index]).padStart(10, "0")} 00000 n `);
  xref.push(`trailer\n<< /Size ${objectBuffers.length + 1} /Root 1 0 R >>`, `startxref`, String(xrefOffset), "%%EOF");
  parts.push(Buffer.from(`${xref.join("\n")}\n`, "ascii"));
  return Buffer.concat(parts);
}
