/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { ByteWriter, type Bytes } from './byteWriter';

/**
 * 单页 PDF 编码器（Photoshop PDF 的简化版）。
 *
 * 做法是把一张 JPEG 原样塞进 PDF 的图像对象，滤镜声明成 DCTDecode ——
 * PDF 原生支持 JPEG 流，所以不用自己写任何压缩代码，浏览器的
 * canvas.toBlob('image/jpeg') 已经把最难的部分做完了。
 *
 * 与 PS 的差距（如实记下来）：PS 的 Photoshop PDF 能保留图层、
 * 可编辑文字和矢量路径，重新打开还是可编辑的。我们这份是**拼合后的位图**，
 * 只能看不能再编辑。真正的分层 PDF 要实现 PDF 的可选内容组与字体嵌入，
 * 不是一个编码器的量级。
 *
 * 页面尺寸按 72 DPI 换算成 PDF 点（1 点 = 1/72 英寸），
 * 所以像素数和点数一比一，图像不会被拉伸。
 */

/** PDF 交叉引用表需要每个对象的字节偏移 */
interface PdfObject {
  id: number;
  body: string | { header: string; data: Uint8Array };
}

export function encodePdf(jpeg: Bytes, width: number, height: number, dpi = 72): Bytes {
  // 点数 = 像素 / DPI * 72
  const pageWidth = ((width / dpi) * 72).toFixed(2);
  const pageHeight = ((height / dpi) * 72).toFixed(2);

  const objects: PdfObject[] = [
    { id: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' },
    { id: 2, body: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
    {
      id: 3,
      body:
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
        '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>',
    },
    {
      id: 4,
      body: {
        header:
          `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
          '/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ' +
          `/Length ${jpeg.length} >>`,
        data: jpeg,
      },
    },
    // 内容流：把图像铺满整页。cm 的六个数是仿射矩阵，这里只做缩放
    { id: 5, body: contentStream(pageWidth, pageHeight) },
  ];

  return assemble(objects);
}

/** 画满整页的内容流对象 */
function contentStream(pageWidth: string, pageHeight: string): string {
  const draw = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`;
  return `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`;
}

/** 把对象按 PDF 文件结构拼起来，并生成交叉引用表 */
function assemble(objects: PdfObject[]): Bytes {
  const w = new ByteWriter(4096);
  const offsets = new Map<number, number>();

  w.ascii('%PDF-1.4\n');
  // 二进制注释行，告诉工具这个文件含二进制数据
  w.bytes([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]);

  for (const object of objects) {
    offsets.set(object.id, w.offset);
    w.ascii(`${object.id} 0 obj\n`);
    if (typeof object.body === 'string') {
      w.ascii(object.body);
    } else {
      w.ascii(`${object.body.header}\nstream\n`);
      w.bytes(object.body.data);
      w.ascii('\nendstream');
    }
    w.ascii('\nendobj\n');
  }

  // 交叉引用表：每条 20 字节定长，格式写错的话 PDF 阅读器会拒绝打开
  const xrefStart = w.offset;
  w.ascii(`xref\n0 ${objects.length + 1}\n`);
  w.ascii('0000000000 65535 f \n');
  for (const object of objects) {
    const offset = String(offsets.get(object.id) ?? 0).padStart(10, '0');
    w.ascii(`${offset} 00000 n \n`);
  }
  w.ascii(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`,
  );
  return w.toBytes();
}
