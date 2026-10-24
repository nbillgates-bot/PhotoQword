/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './index';
import { ctx2d } from '../engine/canvasUtils';

/** 每个用例都从一张干净的小文档开始，尺寸取小以便逐像素断言 */
function freshDoc(width = 8, height = 8): void {
  useEditorStore.getState().createDoc({
    name: '测试',
    width,
    height,
    background: 'white',
  });
}

/** 在当前活动图层上涂一个实心方块，用来制造可区分的历史状态 */
function paint(color: string, x = 0, y = 0, w = 4, h = 4): void {
  const store = useEditorStore.getState();
  const layer = store.activeLayer();
  if (!layer) throw new Error('没有活动图层');
  const context = ctx2d(layer.canvas);
  context.fillStyle = color;
  context.fillRect(x, y, w, h);
}

function pixel(x = 0, y = 0): number[] {
  const layer = useEditorStore.getState().activeLayer();
  if (!layer) throw new Error('没有活动图层');
  const d = ctx2d(layer.canvas).getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

/** 按 id 读某个图层的像素，不受活动图层变化影响 */
function pixelOfLayer(id: string, x = 0, y = 0): number[] {
  const layer = useEditorStore.getState().layers.find((item) => item.id === id);
  if (!layer) throw new Error(`找不到图层 ${id}`);
  const d = ctx2d(layer.canvas).getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

const RED = [255, 0, 0, 255];
const GREEN = [0, 128, 0, 255];
const WHITE = [255, 255, 255, 255];

describe('historySlice', () => {
  beforeEach(() => {
    useEditorStore.getState().closeDoc();
  });

  describe('初始状态', () => {
    it('新建文档后有且只有一条初始快照，且不能再撤销', () => {
      freshDoc();
      const { history, historyIndex } = useEditorStore.getState();
      expect(history).toHaveLength(1);
      expect(historyIndex).toBe(0);
      // history[0] 是恒定的可回退起点，所以此时 canUndo 必须为 false
      expect(useEditorStore.getState().canUndo()).toBe(false);
      expect(useEditorStore.getState().canRedo()).toBe(false);
    });

    it('没有文档时 pushHistory 不产生任何记录', () => {
      useEditorStore.getState().pushHistory('不该出现');
      expect(useEditorStore.getState().history).toHaveLength(0);
      expect(useEditorStore.getState().historyIndex).toBe(-1);
    });
  });

  describe('撤销与重做', () => {
    it('撤销回到上一步的像素，重做再回来', () => {
      freshDoc();
      paint('#ff0000');
      useEditorStore.getState().pushHistory('涂红');
      expect(pixel()).toEqual(RED);

      useEditorStore.getState().undo();
      expect(pixel()).toEqual(WHITE);

      useEditorStore.getState().redo();
      expect(pixel()).toEqual(RED);
    });

    it('连续多步能逐级回退，索引同步变化', () => {
      freshDoc();
      paint('#ff0000');
      useEditorStore.getState().pushHistory('涂红');
      paint('#008000');
      useEditorStore.getState().pushHistory('涂绿');

      expect(useEditorStore.getState().historyIndex).toBe(2);
      useEditorStore.getState().undo();
      expect(pixel()).toEqual(RED);
      expect(useEditorStore.getState().historyIndex).toBe(1);
      useEditorStore.getState().undo();
      expect(pixel()).toEqual(WHITE);
      expect(useEditorStore.getState().historyIndex).toBe(0);
    });

    it('到底之后再撤销无效，不会越界到 -1', () => {
      freshDoc();
      paint('#ff0000');
      useEditorStore.getState().pushHistory('涂红');
      for (let i = 0; i < 5; i += 1) useEditorStore.getState().undo();
      expect(useEditorStore.getState().historyIndex).toBe(0);
      expect(pixel()).toEqual(WHITE);
    });

    it('到顶之后再重做无效，不会越界', () => {
      freshDoc();
      paint('#ff0000');
      useEditorStore.getState().pushHistory('涂红');
      for (let i = 0; i < 5; i += 1) useEditorStore.getState().redo();
      expect(useEditorStore.getState().historyIndex).toBe(1);
      expect(pixel()).toEqual(RED);
    });
  });

  describe('分支丢弃', () => {
    it('撤销后再操作会丢掉 redo 分支', () => {
      freshDoc();
      paint('#ff0000');
      useEditorStore.getState().pushHistory('涂红');
      paint('#008000');
      useEditorStore.getState().pushHistory('涂绿');

      useEditorStore.getState().undo(); // 回到"涂红"
      useEditorStore.getState().undo(); // 回到初始
      paint('#0000ff');
      useEditorStore.getState().pushHistory('涂蓝');

      // 原来的"涂红/涂绿"分支应被截断，只剩初始 + 涂蓝
      const { history, historyIndex } = useEditorStore.getState();
      expect(history).toHaveLength(2);
      expect(historyIndex).toBe(1);
      expect(history.map((e) => e.label)).toEqual(['action.newDoc', '涂蓝']);
      expect(useEditorStore.getState().canRedo()).toBe(false);
    });
  });

  describe('jumpHistory', () => {
    it('可以直接跳到任意一步', () => {
      freshDoc();
      paint('#ff0000');
      useEditorStore.getState().pushHistory('涂红');
      paint('#008000');
      useEditorStore.getState().pushHistory('涂绿');

      useEditorStore.getState().jumpHistory(0);
      expect(pixel()).toEqual(WHITE);
      useEditorStore.getState().jumpHistory(2);
      expect(pixel()).toEqual(GREEN);
      useEditorStore.getState().jumpHistory(1);
      expect(pixel()).toEqual(RED);
    });

    it('越界索引被忽略，状态不变', () => {
      freshDoc();
      paint('#ff0000');
      useEditorStore.getState().pushHistory('涂红');
      const before = useEditorStore.getState().historyIndex;
      useEditorStore.getState().jumpHistory(-1);
      useEditorStore.getState().jumpHistory(99);
      expect(useEditorStore.getState().historyIndex).toBe(before);
      expect(pixel()).toEqual(RED);
    });
  });

  describe('快照隔离', () => {
    it('历史里的像素不会被后续绘制污染', () => {
      freshDoc();
      paint('#ff0000');
      useEditorStore.getState().pushHistory('涂红');
      // 压完快照后继续在同一张画布上涂绿但不压历史。
      // 此时 history[1] 存的必须还是红色——快照要和活动画布彻底脱钩，
      // 否则"撤销"会把用户已经撤掉的改动又带回来。
      paint('#008000');
      useEditorStore.getState().jumpHistory(1);
      expect(pixel()).toEqual(RED);
    });

    it('撤销取回的是副本，改动它不会污染历史', () => {
      freshDoc();
      paint('#ff0000');
      useEditorStore.getState().pushHistory('涂红');
      useEditorStore.getState().undo();
      paint('#008000'); // 在恢复出来的图层上乱涂，但不压历史
      useEditorStore.getState().redo();
      useEditorStore.getState().undo();
      expect(pixel()).toEqual(WHITE); // 初始快照必须完好
    });
  });

  /*
   * hint 是性能契约，不是可选优化：不带 hint 时 pushHistory 会对每个图层
   * getImageData 全幅再逐字节 diff。大 PSD 上点一下眼睛就是几十次全幅扫描。
   * layerIds: [] 的语义是"这一步一个像素都没动"，用例钉住这个语义。
   */
  describe('像素提示（hint）', () => {
    it('layerIds 为空时不产生任何像素增量', () => {
      freshDoc();
      const layer = useEditorStore.getState().activeLayer();
      if (!layer) throw new Error('没有活动图层');

      useEditorStore.getState().updateLayer(layer.id, { visible: false });
      useEditorStore.getState().pushHistory('隐藏图层', { layerIds: [] });

      const { history, historyIndex } = useEditorStore.getState();
      expect(history[historyIndex].label).toBe('隐藏图层');
      expect(history[historyIndex].deltas).toEqual([]);
    });

    it('没有像素增量也照样能撤销回可见状态', () => {
      freshDoc();
      const layer = useEditorStore.getState().activeLayer();
      if (!layer) throw new Error('没有活动图层');

      useEditorStore.getState().updateLayer(layer.id, { visible: false });
      useEditorStore.getState().pushHistory('隐藏图层', { layerIds: [] });
      expect(useEditorStore.getState().layers[0].visible).toBe(false);

      // 可见性存在 meta 里（绝对值），所以不依赖 deltas 就能回退
      useEditorStore.getState().undo();
      expect(useEditorStore.getState().layers[0].visible).toBe(true);
      useEditorStore.getState().redo();
      expect(useEditorStore.getState().layers[0].visible).toBe(false);
    });

    it('谎报 layerIds 为空会丢掉像素改动，所以改了像素就必须点名', () => {
      freshDoc();
      paint('#ff0000');
      // 故意不点名：这一步的像素变化不会被记录
      useEditorStore.getState().pushHistory('涂红但没点名', { layerIds: [] });
      expect(useEditorStore.getState().history[1].deltas).toEqual([]);
      // 撤销回不到白色——这正是 hint 用错的代价，钉住它免得有人乱加空 hint
      useEditorStore.getState().undo();
      expect(pixel()).toEqual(RED);
    });

    it('点名后像素增量照常记录，撤销可用', () => {
      freshDoc();
      const layer = useEditorStore.getState().activeLayer();
      if (!layer) throw new Error('没有活动图层');
      paint('#ff0000');
      useEditorStore.getState().pushHistory('涂红', { layerIds: [layer.id] });

      expect(useEditorStore.getState().history[1].deltas.length).toBeGreaterThan(0);
      useEditorStore.getState().undo();
      expect(pixel()).toEqual(WHITE);
    });
  });

  /*
   * 「加一个图层」这类操作只新增了一张空画布，原有图层的像素一个都没动。
   * 不点名的话每加一层就要把已有图层全部扫一遍，图层多了就是纯浪费。
   */
  describe('新增图层类操作自带 hint', () => {
    /*
     * 判定方式是行为而不是「pushHistory 收到了什么参数」：
     * 造一个「像素改过但没压历史」的图层，带 hint 的那一步不会扫它，
     * 于是它的改动不进这一步的 deltas，撤销后仍然留着。
     * 不带 hint 的话这一步会顺手把它扫进去，撤销就把它抹回白色——用例即刻变红。
     */
    function dirtyBaseLayer(): string {
      const id = useEditorStore.getState().activeLayer()!.id;
      paint('#ff0000');
      return id;
    }

    it('addLayer 不扫其他图层', () => {
      freshDoc();
      const base = dirtyBaseLayer();

      useEditorStore.getState().addLayer('raster', '新的');
      useEditorStore.getState().undo();

      expect(pixelOfLayer(base)).toEqual(RED);
    });

    it('addAdjustmentLayer 不扫其他图层', () => {
      freshDoc();
      const base = dirtyBaseLayer();

      useEditorStore.getState().addAdjustmentLayer('brightness-contrast', {});
      useEditorStore.getState().undo();

      expect(pixelOfLayer(base)).toEqual(RED);
    });

    it('addLayerFromCanvas 不扫其他图层', () => {
      freshDoc();
      const base = dirtyBaseLayer();
      const source = useEditorStore.getState().activeLayer()!.canvas;

      useEditorStore.getState().addLayerFromCanvas(source, '拷进来的');
      useEditorStore.getState().undo();

      expect(pixelOfLayer(base)).toEqual(RED);
    });

    it('新建的那一层自己照样进历史，撤销后消失', () => {
      freshDoc();
      const layer = useEditorStore.getState().addLayer('raster', '新的');
      expect(useEditorStore.getState().layers).toHaveLength(2);

      useEditorStore.getState().undo();

      expect(useEditorStore.getState().layers.map((item) => item.id)).not.toContain(layer!.id);
    });
  });

  /*
   * 初始快照不扫描图层（deltas 恒为空），依据是 walk() 两个方向都碰不到
   * 目标那一步自己的 deltas。省下的是打开几百图层 PSD 时的几百次整幅回读。
   * 这一组用行为证明「不扫」没有削弱任何回退能力。
   */
  describe('初始快照不扫描', () => {
    it('history[0] 没有像素增量', () => {
      freshDoc();
      expect(useEditorStore.getState().history[0].deltas).toHaveLength(0);
    });

    it('第一次编辑照样能撤销回初始画面', () => {
      freshDoc();
      paint('#ff0000');
      useEditorStore.getState().pushHistory('涂红');

      useEditorStore.getState().undo();

      expect(pixel()).toEqual(WHITE);
      expect(useEditorStore.getState().historyIndex).toBe(0);
    });

    it('多步之后一路退回第 0 步，画面回到初始', () => {
      freshDoc();
      for (let i = 0; i < 5; i += 1) {
        paint(i % 2 === 0 ? '#ff0000' : '#008000');
        useEditorStore.getState().pushHistory(`第 ${i} 步`);
      }
      for (let i = 0; i < 5; i += 1) useEditorStore.getState().undo();

      expect(useEditorStore.getState().historyIndex).toBe(0);
      expect(pixel()).toEqual(WHITE);
    });

    // jumpHistory(当前步) 走的是「从影子重画」那条路，不碰 deltas。
    // 影子是懒解的，这条用例顺带证明懒解在这条路上也解得出来。
    it('跳到当前步会丢弃未提交的改动', () => {
      freshDoc();
      paint('#ff0000');
      useEditorStore.getState().pushHistory('涂红');
      // 改了像素但不压历史，等于「未提交」
      paint('#008000');

      useEditorStore.getState().jumpHistory(useEditorStore.getState().historyIndex);

      expect(pixel()).toEqual(RED);
    });

    // 溢出裁剪会把原来的 history[1] 顶成新的 history[0]，
    // 它带着 deltas，但同样永远用不到——回退到它照样要正确
    it('裁剪后退到新的第 0 步，画面与那一步一致', () => {
      freshDoc(4, 4);
      for (let i = 0; i < 40; i += 1) {
        paint(i % 2 === 0 ? '#ff0000' : '#008000');
        useEditorStore.getState().pushHistory(`第 ${i} 步`);
      }
      for (let i = 0; i < 50; i += 1) useEditorStore.getState().undo();

      const { history, historyIndex } = useEditorStore.getState();
      expect(historyIndex).toBe(0);
      // 新的第 0 步是原来的「第 10 步」（涂红那一轮），画面应为它之后的样子
      expect(history[0].label).toBe('第 10 步');
      expect(pixel()).toEqual(RED);
    });
  });

  describe('上限', () => {
    it('超过上限后丢弃最旧的，索引仍指向最新一条', () => {
      freshDoc(4, 4);
      for (let i = 0; i < 40; i += 1) {
        paint(i % 2 === 0 ? '#ff0000' : '#008000');
        useEditorStore.getState().pushHistory(`第 ${i} 步`);
      }
      const { history, historyIndex } = useEditorStore.getState();
      expect(history).toHaveLength(30);
      expect(historyIndex).toBe(29);
      expect(history[history.length - 1].label).toBe('第 39 步');
      // 被挤掉的最旧记录不该还在
      expect(history.some((e) => e.label === 'action.newDoc')).toBe(false);
    });

    it('挤满后仍然能一路撤销到最旧的那条', () => {
      freshDoc(4, 4);
      for (let i = 0; i < 40; i += 1) {
        paint(i % 2 === 0 ? '#ff0000' : '#008000');
        useEditorStore.getState().pushHistory(`第 ${i} 步`);
      }
      for (let i = 0; i < 50; i += 1) useEditorStore.getState().undo();
      expect(useEditorStore.getState().historyIndex).toBe(0);
    });
  });
});
