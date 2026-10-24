/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { encodePdf } from './pdf';

/** 假 JPEG 字节。PDF 只是原样搬运它，内容对不对由浏览器编码器负责 */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

/** 把整个文件当 latin1 文本读，方便断言 PDF 的骨架 */
function asText(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

describe('PDF 骨架', () => {
  it('以 %PDF-1.4 开头、以 %%EOF 收尾', () => {
    const text = asText(encodePdf(JPEG, 100, 50));
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('含二进制标记注释，工具据此判断这是二进制文件', () => {
    const bytes = encodePdf(JPEG, 10, 10);
    // 第二行是 % 加四个高位字节
    expect(bytes[9]).toBe(0x25);
    expect(bytes[10]).toBeGreaterThan(0x7f);
  });

  it('五个对象都在，编号连续', () => {
    const text = asText(encodePdf(JPEG, 10, 10));
    for (let id = 1; id <= 5; id += 1) {
      expect(text).toContain(`${id} 0 obj`);
    }
  });

  it('声明目录、页面树与单页', () => {
    const text = asText(encodePdf(JPEG, 10, 10));
    expect(text).toContain('/Type /Catalog');
    expect(text).toContain('/Count 1');
    expect(text).toContain('/Type /Page');
  });

  it('trailer 指向目录对象', () => {
    const text = asText(encodePdf(JPEG, 10, 10));
    expect(text).toContain('/Root 1 0 R');
  });
});

describe('图像对象', () => {
  it('声明 DCTDecode（JPEG）滤镜', () => {
    const text = asText(encodePdf(JPEG, 10, 10));
    expect(text).toContain('/Filter /DCTDecode');
  });

  it('JPEG 数据原样嵌在对象 4 的流里', () => {
    const bytes = encodePdf(JPEG, 10, 10);
    // stream...endstream 之间应该就是原 JPEG
    const text = asText(bytes);
    const start = text.indexOf('stream\n', text.indexOf('4 0 obj')) + 7;
    const end = text.indexOf('\nendstream', start);
    expect([...bytes.subarray(start, end)]).toEqual([...JPEG]);
  });

  it('长度字段等于 JPEG 实际长度', () => {
    const text = asText(encodePdf(JPEG, 10, 10));
    expect(text).toContain(`/Length ${JPEG.length}`);
  });
});

describe('尺寸与分辨率', () => {
  it('MediaBox 按 72 DPI 换算成点，宽高和像素一比一', () => {
    // 100×50 像素默认 72 DPI，1 像素 = 1 点
    const text = asText(encodePdf(JPEG, 100, 50));
    expect(text).toContain('/MediaBox [0 0 100.00 50.00]');
  });

  it('指定 DPI 时按比例缩放页面尺寸', () => {
    // 144 DPI → 点数 = 像素 / 144 * 72 = 像素 / 2
    const text = asText(encodePdf(JPEG, 144, 72, 144));
    expect(text).toContain('/MediaBox [0 0 72.00 36.00]');
  });

  it('图像对象里的宽高仍是像素', () => {
    const text = asText(encodePdf(JPEG, 100, 50, 144));
    // 对象 4 声明的宽高不受 DPI 影响，是原图像尺寸
    expect(text).toContain('/Width 100');
    expect(text).toContain('/Height 50');
  });

  it('内容流用仿射矩阵把图像铺满整页', () => {
    const text = asText(encodePdf(JPEG, 100, 50));
    // cm 的前两个参数是缩放：页面宽×页面高
    expect(text).toContain('100.00 0 0 50.00 0 0 cm');
  });
});

describe('边界尺寸', () => {
  it('1×1 能编码', () => {
    const bytes = encodePdf(JPEG, 1, 1);
    expect(asText(bytes)).toContain('%PDF-1.4');
    expect(asText(bytes)).toContain('%%EOF');
  });

  it('超宽或超高图的尺寸不溢出', () => {
    const bytes = encodePdf(JPEG, 30000, 20000);
    const text = asText(bytes);
    expect(text).toContain('/Width 30000');
    expect(text).toContain('/MediaBox [0 0 30000.00 20000.00]');
  });

  it('字节值全部合法（PDF 骨架部分）', () => {
    const bytes = encodePdf(JPEG, 10, 10);
    expect([...bytes].every((v) => Number.isInteger(v) && v >= 0 && v <= 255)).toBe(true);
  });
});
