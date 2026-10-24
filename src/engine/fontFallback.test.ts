/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  FONT_FALLBACK_MAP,
  fontAvailable,
  fontFamilyWithFallback,
  isGenericFamily,
  resolveFontFamily,
} from './fontFallback';

/*
 * 通用族的探测必须短路。
 * 宽度探针拿 `"sans-serif", sans-serif` 和 `sans-serif` 比，量出来必然一样宽，
 * 会把一个永远可用的名字判成「本机没有」——诊断日志因此误报过「缺字体」。
 */
describe('isGenericFamily', () => {
  it('认得 CSS 通用族', () => {
    for (const family of ['serif', 'sans-serif', 'monospace', 'cursive', 'system-ui']) {
      expect(isGenericFamily(family)).toBe(true);
    }
  });

  it('具体字体名不是通用族', () => {
    for (const family of ['Arial', 'Noto Sans SC', 'SimSun', '微软雅黑', '']) {
      expect(isGenericFamily(family)).toBe(false);
    }
  });

  it('大小写和首尾空白不影响判断', () => {
    expect(isGenericFamily(' Sans-Serif ')).toBe(true);
  });

  it('名字里含 serif 不等于就是通用族', () => {
    expect(isGenericFamily('Noto Serif SC')).toBe(false);
  });
});

describe('fontAvailable', () => {
  it('通用族一律可用，不走宽度探测', () => {
    for (const family of ['serif', 'sans-serif', 'monospace']) {
      expect(fontAvailable(family)).toBe(true);
    }
  });

  it('编不出来的字体名判成不可用', () => {
    expect(fontAvailable('绝无此字体-QWORD-Test-9f3a')).toBe(false);
  });
});

/**
 * resolveFontFamily 有两条路：本机装了候选字体就直接用，没装就退到后备。
 * 跑测试的机器上装了什么字体是不确定的，所以下面所有断言都必须
 * **两条路都成立**，不能写死其中一条的具体返回值。
 */

/** 一个 family 名算不算「有效结果」：非空、非 undefined、能直接写进 CSS */
function isUsableFamily(family: string): boolean {
  return typeof family === 'string' && family.trim().length > 0;
}

describe('resolveFontFamily', () => {
  describe('返回值总是可用的', () => {
    const names = ['SimSun', '微软雅黑', 'ArialMT', '某个根本不存在的字体', ''];

    for (const name of names) {
      it(`「${name || '空串'}」也要给出能用的 family`, () => {
        const { family } = resolveFontFamily(name);
        expect(isUsableFamily(family)).toBe(true);
      });
    }
  });

  describe('映射表', () => {
    /*
     * 三条路都得成立，跑在哪台机器上不该影响结论：
     * 本机装着原字体（Windows 一般都装着）→ 原名；
     * 没装但拿得到开源替代 → 映射目标；
     * 都拿不到 → 通用族。
     */
    it('中文字体落在「原字体 / 开源替代 / 通用族」三者之一', () => {
      expect(['微软雅黑', 'Noto Sans SC', 'sans-serif']).toContain(
        resolveFontFamily('微软雅黑').family,
      );
      expect(['SimSun', 'Noto Serif SC', 'serif']).toContain(resolveFontFamily('SimSun').family);
    });

    /*
     * 这里直接断言映射表本身，而不是 resolveFontFamily 的返回值。
     * PostScript 名和全名是两个不同的字符串，本机可能只按其中一个名字装着，
     * 那时两者的解析结果本来就该不同（有正主就用正主）。
     * 真正要保证的不变量是：它们在表里指向同一个替代品。
     */
    it('PostScript 名和全名在映射表里指向同一个替代品', () => {
      expect(FONT_FALLBACK_MAP['MicrosoftYaHei']).toBe(FONT_FALLBACK_MAP['微软雅黑']);
      expect(FONT_FALLBACK_MAP['SimSun']).toBe(FONT_FALLBACK_MAP['宋体']);
      expect(FONT_FALLBACK_MAP['SimHei']).toBe(FONT_FALLBACK_MAP['黑体']);
    });

    it('映射表里每个目标 family 自己也能解析（不会二次映射到别处）', () => {
      for (const target of new Set(Object.values(FONT_FALLBACK_MAP))) {
        const { family } = resolveFontFamily(target);
        expect(isUsableFamily(family)).toBe(true);
      }
    });
  });

  /*
   * 回归测试：一个 PSD 用了阿里巴巴普惠体的三个字重，PSD 里存的是
   * AlibabaPuHuiTi-Medium / -Light / -Regular，替换表只有家族名，
   * 于是三层全部退到 sans-serif，重新编辑时字形和位置全变。
   * 查表前先削字重后缀就是这条的修法。
   */
  describe('带字重后缀的字体名', () => {
    const PUHUITI_NAMES = [
      'AlibabaPuHuiTi',
      'AlibabaPuHuiTi-Light',
      'AlibabaPuHuiTi-Regular',
      'AlibabaPuHuiTi-Medium',
      'AlibabaPuHuiTi-Bold',
      'AlibabaPuHuiTi-3-55-Regular',
    ];

    it('普惠体各字重一个都不许掉进通用族', () => {
      // 退到通用族意味着连下载都没触发，字形一定和 PSD 不一样
      for (const name of PUHUITI_NAMES) {
        const { family } = resolveFontFamily(name);
        expect(isGenericFamily(family), `${name} 退到了通用族`).toBe(false);
      }
    });

    it('本机没装的那些统一归到同一个可下载家族名', () => {
      // 本机恰好装了某个字重时会原样返回它，那条路不该让这条用例翻车
      const notInstalled = PUHUITI_NAMES.filter((name) => !fontAvailable(name));
      const families = new Set(notInstalled.map((name) => resolveFontFamily(name).family));

      expect(families.size).toBeLessThanOrEqual(1);
    });

    it('削后缀不影响原本就能精确匹配的名字', () => {
      // 这些键在表里是全名，削不动也该照旧命中
      expect(FONT_FALLBACK_MAP['SimSun-ExtB']).toBe(FONT_FALLBACK_MAP['SimSun']);
      expect(resolveFontFamily('SimSun-ExtB').family).not.toBe('sans-serif');
    });

    it('削完还是查不到的，照旧退通用族，不许瞎猜', () => {
      expect(['sans-serif', 'serif']).toContain(resolveFontFamily('某某某字体-Medium').family);
    });
  });

  describe('isSubstitute 标记', () => {
    it('只要最终 family 不是原来那个名字，就算替代', () => {
      // 本机装着宋体时（Windows）原样返回 SimSun，不算替代；
      // 没装才会退到思源宋体或通用衬线族，那才算。两条路都得自洽
      for (const name of ['SimSun', '微软雅黑', 'Verdana']) {
        const { family, isSubstitute } = resolveFontFamily(name);
        expect(isSubstitute).toBe(family !== name);
      }
    });

    it('映射表里没有、本机也没有的字体一定算替代', () => {
      const { family, isSubstitute } = resolveFontFamily('绝无可能装了的字体名');
      // 这个名字不可能装在任何机器上，必然退到通用族
      expect(['sans-serif', 'serif']).toContain(family);
      expect(isSubstitute).toBe(true);
    });
  });

  describe('通用族的挑选', () => {
    it('名字里带 serif / 宋 / 楷 / Times / Georgia 的退到衬线体', () => {
      // 都是映射表里没有的名字，保证走到最后那条通用族分支
      expect(resolveFontFamily('未知宋体X').family).toBe('serif');
      expect(resolveFontFamily('未知楷书X').family).toBe('serif');
      expect(resolveFontFamily('MySerifFontX').family).toBe('serif');
      expect(resolveFontFamily('TimesLikeFontX').family).toBe('serif');
    });

    it('其余退到无衬线体', () => {
      expect(resolveFontFamily('未知圆体X').family).toBe('sans-serif');
      expect(resolveFontFamily('MyDisplayFontX').family).toBe('sans-serif');
    });
  });

  describe('本机装着原字体时不替代', () => {
    /*
     * 回归测试：以前是先查映射表再判断有没有装，于是 Windows 上明明装着
     * 微软雅黑，也会被换成要下载的思源黑体。表现就是重新编辑文字层时字体变样。
     */
    it('原字体可用时返回原名，且不标替代', () => {
      for (const name of ['微软雅黑', 'SimSun', 'Georgia', 'Verdana']) {
        const { family, isSubstitute } = resolveFontFamily(name);
        // 装了 → 原名 + 不算替代；没装 → 换了名字 + 算替代
        if (!isSubstitute) expect(family).toBe(name);
        else expect(family).not.toBe(name);
      }
    });
  });

  describe('不联网、不抛错', () => {
    it('是同步函数，返回的不是 Promise', () => {
      const result = resolveFontFamily('SimSun');
      // 这一条是回归测试：这个函数曾经是 async，导致 PSD 导入被网络拖死
      expect(result).not.toBeInstanceOf(Promise);
      expect(typeof result.family).toBe('string');
      expect(typeof result.isSubstitute).toBe('boolean');
    });

    it('连续解析很多字体也是瞬时的', () => {
      // 一个 PSD 里有几十个文字层是常事，这里不能有任何等待
      for (let i = 0; i < 200; i += 1) {
        expect(isUsableFamily(resolveFontFamily(`字体${i}`).family)).toBe(true);
      }
    });
  });
});

/*
 * 没有兜底通用族时，字体缺失会掉到浏览器自己的默认字体（Chrome 上是 Times New Roman）。
 * canvas 上是画死的像素、textarea 是实时排版，两者掉下去的时机不一样，
 * 于是「一进编辑字体就变了」。补上兜底族就是让两边的降级路径一致。
 */
describe('fontFamilyWithFallback', () => {
  it('普通字体名加引号并接上通用族', () => {
    expect(fontFamilyWithFallback('Noto Sans SC')).toBe('"Noto Sans SC", sans-serif');
    expect(fontFamilyWithFallback('Arial')).toBe('"Arial", sans-serif');
  });

  it('看着像衬线体的接 serif', () => {
    expect(fontFamilyWithFallback('Noto Serif SC')).toBe('"Noto Serif SC", serif');
    expect(fontFamilyWithFallback('Times New Roman')).toBe('"Times New Roman", serif');
    expect(fontFamilyWithFallback('宋体')).toBe('"宋体", serif');
    expect(fontFamilyWithFallback('楷体')).toBe('"楷体", serif');
  });

  it('本身就是通用族时不再套一层', () => {
    expect(fontFamilyWithFallback('serif')).toBe('serif');
    expect(fontFamilyWithFallback('sans-serif')).toBe('sans-serif');
  });

  it('结果永远能直接拼进 CSS font 简写，不留空引号', () => {
    for (const name of ['', ' ', 'A B C', "O'Neil"]) {
      const result = fontFamilyWithFallback(name);
      expect(result.endsWith('serif')).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    }
  });

  it('resolveFontFamily 的返回值套进去都是合法结果', () => {
    for (const name of ['SimSun', '微软雅黑', 'ArialMT', '不存在的字体X']) {
      const { family } = resolveFontFamily(name);
      expect(fontFamilyWithFallback(family).endsWith('serif')).toBe(true);
    }
  });
});
