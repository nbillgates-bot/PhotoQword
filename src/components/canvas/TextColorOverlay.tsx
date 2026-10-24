/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { CSSProperties } from 'react';
import type { TextData } from '../../types';
import { colorAt } from '../../engine/textRuns';
import styles from './TextEditor.module.css';

interface TextColorOverlayProps {
  data: TextData;
  /** 与 textarea 完全相同的排版样式，两者必须逐字对齐 */
  layout: CSSProperties;
}

/** 把内容按颜色切成同色片段，保留换行符（换行要参与布局） */
function segments(data: TextData): { text: string; color: string }[] {
  const result: { text: string; color: string }[] = [];
  let index = 0;

  for (const char of data.content) {
    const color = colorAt(data.colorRuns, index, data.color);
    const last = result[result.length - 1];
    if (last && last.color === color) {
      last.text += char;
    } else {
      result.push({ text: char, color });
    }
    index += char.length;
  }

  return result;
}

/**
 * 编辑态下显示字符级颜色的叠层。
 *
 * textarea 天生只能整块一个颜色（它没有富文本能力），所以做法是：
 * textarea 的文字设成透明、只留光标和选区高亮，真正看到的字由这个 div 画。
 * 两者用同一套排版样式重叠在一起，字就落在同一位置。
 *
 * PS 的做法是自绘文字与光标，没有 textarea 这一层；浏览器里自绘会丢掉
 * 输入法、拼写、原生选区与撤销，代价太大，所以退化成「透明 textarea + 彩色叠层」
 * （规约 §零 第 3 条）。
 *
 * 叠层压在 textarea **上面**并且 pointer-events: none：
 * 放下面会被 textarea 的选区高亮整块盖住，选中几个字就看不见颜色了。
 */
export default function TextColorOverlay({ data, layout }: TextColorOverlayProps) {
  return (
    <div className={styles.colorOverlay} style={layout} aria-hidden="true">
      {segments(data).map((segment, index) => (
        <span key={index} style={{ color: segment.color }}>
          {segment.text}
        </span>
      ))}
      {/*
       * 末尾补一个零宽字符：内容以换行结尾时，浏览器不会给最后那个空行留高度，
       * 叠层会比 textarea 短一截，往上顶得整段字错位。
       */}
      {'​'}
    </div>
  );
}
