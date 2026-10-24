/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  EMPTY_GESTURE,
  gestureCancel,
  gestureDown,
  gestureMove,
  gestureUp,
  takeLongPress,
  LONG_PRESS_MS,
  MULTI_TAP_MAX_MS,
  type GestureAction,
  type GestureState,
} from './touchGestures';

const at = (id: number, x: number, y: number) => ({ id, point: { x, y } });

/** 顺序跑一串操作，返回最终状态与途中产出的全部手势 */
function run(
  steps: Array<(state: GestureState) => { state: GestureState; actions: GestureAction[] }>,
): { state: GestureState; actions: GestureAction[] } {
  let state = EMPTY_GESTURE;
  const actions: GestureAction[] = [];
  for (const step of steps) {
    const result = step(state);
    state = result.state;
    actions.push(...result.actions);
  }
  return { state, actions };
}

const kinds = (actions: GestureAction[]) => actions.map((item) => item.kind);

describe('单指', () => {
  it('落指只记位置，不产出任何手势（此刻还分不清是画还是要平移）', () => {
    const step = gestureDown(EMPTY_GESTURE, at(1, 50, 50), 0);
    expect(step.actions).toEqual([]);
    expect(step.state.points).toHaveLength(1);
    expect(step.state.multi).toBe(false);
  });

  it('单指移动不产出手势（交给工具层）', () => {
    const { actions } = run([
      (s) => gestureDown(s, at(1, 50, 50), 0),
      (s) => gestureMove(s, at(1, 200, 200)),
    ]);
    expect(actions).toEqual([]);
  });

  it('全部抬起回到空态', () => {
    const { state } = run([(s) => gestureDown(s, at(1, 10, 10), 0), (s) => gestureUp(s, 1, 100)]);
    expect(state).toEqual(EMPTY_GESTURE);
  });
});

describe('单指转双指的过渡', () => {
  it('第二根手指落下时作废单指那一笔', () => {
    const { state, actions } = run([
      (s) => gestureDown(s, at(1, 100, 100), 0),
      (s) => gestureMove(s, at(1, 120, 100)),
      (s) => gestureDown(s, at(2, 200, 100), 20),
    ]);
    expect(kinds(actions)).toEqual(['cancelStroke']);
    expect(state.multi).toBe(true);
  });

  it('第二根手指落下本身不产出缩放或平移（基准要重置，否则画面会跳）', () => {
    const { actions } = run([
      (s) => gestureDown(s, at(1, 100, 100), 0),
      (s) => gestureDown(s, at(2, 300, 100), 10),
    ]);
    expect(kinds(actions)).toEqual(['cancelStroke']);
  });

  it('进入多指后长按候选作废', () => {
    const { state } = run([
      (s) => gestureDown(s, at(1, 100, 100), 0),
      (s) => gestureDown(s, at(2, 200, 100), 10),
    ]);
    expect(state.longPress).toBeNull();
    expect(takeLongPress(state, 1000).actions).toEqual([]);
  });

  it('抬到只剩一根手指时，剩下那根既不平移也不画画', () => {
    const { state, actions } = run([
      (s) => gestureDown(s, at(1, 100, 100), 0),
      (s) => gestureDown(s, at(2, 300, 100), 10),
      (s) => gestureUp(s, 2, 900), // 超过单击时限，不算撤销
      (s) => gestureMove(s, at(1, 400, 400)),
    ]);
    // 落第二指时的 cancelStroke 是应有的，之后不该再有任何平移缩放
    expect(kinds(actions)).toEqual(['cancelStroke']);
    // multi 保住，剩下的手指不会被当成新的单指落笔
    expect(state.multi).toBe(true);
  });
});

describe('双指拖与双指单击的区分（有无位移）', () => {
  it('双指平移：中点位移变成 pan，方向与手指一致', () => {
    const { actions } = run([
      (s) => gestureDown(s, at(1, 100, 100), 0),
      (s) => gestureDown(s, at(2, 300, 100), 0),
      // 两指同时右移 40、下移 30，中点同样位移，张开度不变
      (s) => gestureMove(s, at(1, 140, 130)),
      (s) => gestureMove(s, at(2, 340, 130)),
    ]);
    const pans = actions.filter((item) => item.kind === 'pan');
    const dx = pans.reduce((sum, item) => sum + (item.kind === 'pan' ? item.dx : 0), 0);
    const dy = pans.reduce((sum, item) => sum + (item.kind === 'pan' ? item.dy : 0), 0);
    // 一根一根挪，中点各走一半，合起来正好是手指的位移
    expect(dx).toBeCloseTo(40, 6);
    expect(dy).toBeCloseTo(30, 6);
    expect(kinds(actions)).not.toContain('tap');
  });

  it('双指捏合：张开一倍得到约 2 倍的 pinch', () => {
    const { actions } = run([
      (s) => gestureDown(s, at(1, 100, 100), 0),
      (s) => gestureDown(s, at(2, 200, 100), 0),
      // 以中点 150 为心向两侧各拉开一倍：间距 100 -> 200
      (s) => gestureMove(s, at(1, 50, 100)),
      (s) => gestureMove(s, at(2, 250, 100)),
    ]);
    const total = actions
      .filter((item) => item.kind === 'pinch')
      .reduce((product, item) => product * (item.kind === 'pinch' ? item.factor : 1), 1);
    expect(total).toBeCloseTo(2, 5);
    // 捏合焦点是两指中点，缩放要锚在这里。两指都挪完之后中点回到 150
    const pinches = actions.filter((item) => item.kind === 'pinch');
    const last = pinches[pinches.length - 1];
    expect(last.kind === 'pinch' && last.focus.x).toBeCloseTo(150, 5);
  });

  it('双指轻点（无位移、时间短）= 撤销', () => {
    const { actions } = run([
      (s) => gestureDown(s, at(1, 100, 100), 0),
      (s) => gestureDown(s, at(2, 200, 100), 5),
      (s) => gestureUp(s, 1, 120),
    ]);
    expect(actions.filter((item) => item.kind === 'tap')).toEqual([{ kind: 'tap', fingers: 2 }]);
  });

  it('抖动没超过容差仍算单击（手指按上去必然有几像素晃动）', () => {
    const { actions } = run([
      (s) => gestureDown(s, at(1, 100, 100), 0),
      (s) => gestureDown(s, at(2, 200, 100), 0),
      (s) => gestureMove(s, at(1, 103, 102)),
      (s) => gestureUp(s, 1, 100),
    ]);
    expect(kinds(actions)).toContain('tap');
  });

  it('拖过之后抬手不再算单击', () => {
    const { actions } = run([
      (s) => gestureDown(s, at(1, 100, 100), 0),
      (s) => gestureDown(s, at(2, 300, 100), 0),
      (s) => gestureMove(s, at(1, 200, 100)),
      (s) => gestureMove(s, at(2, 400, 100)),
      (s) => gestureUp(s, 1, 100),
    ]);
    expect(kinds(actions)).not.toContain('tap');
  });

  it('按住停顿太久再抬手不算单击', () => {
    const { actions } = run([
      (s) => gestureDown(s, at(1, 100, 100), 0),
      (s) => gestureDown(s, at(2, 200, 100), 0),
      (s) => gestureUp(s, 1, MULTI_TAP_MAX_MS + 1),
    ]);
    expect(kinds(actions)).not.toContain('tap');
  });

  it('逐根抬手只发一次单击', () => {
    const { actions } = run([
      (s) => gestureDown(s, at(1, 100, 100), 0),
      (s) => gestureDown(s, at(2, 200, 100), 0),
      (s) => gestureUp(s, 1, 50),
      (s) => gestureUp(s, 2, 60),
    ]);
    expect(actions.filter((item) => item.kind === 'tap')).toHaveLength(1);
  });
});

describe('三指与双指的区分', () => {
  it('三指轻点 = 重做，不是撤销', () => {
    const { actions } = run([
      (s) => gestureDown(s, at(1, 100, 100), 0),
      (s) => gestureDown(s, at(2, 200, 100), 5),
      (s) => gestureDown(s, at(3, 300, 100), 10),
      (s) => gestureUp(s, 2, 120),
    ]);
    expect(actions.filter((item) => item.kind === 'tap')).toEqual([{ kind: 'tap', fingers: 3 }]);
  });

  it('第三根手指落下不产出缩放平移（中点与张开度都会突变）', () => {
    const { actions } = run([
      (s) => gestureDown(s, at(1, 100, 100), 0),
      (s) => gestureDown(s, at(2, 200, 100), 0),
      (s) => gestureDown(s, at(3, 900, 900), 5),
    ]);
    expect(kinds(actions).filter((kind) => kind !== 'cancelStroke')).toEqual([]);
  });

  it('三指中抬掉一根，仍按峰值三指判定（先抬的那根不该改变语义）', () => {
    const { state } = run([
      (s) => gestureDown(s, at(1, 100, 100), 0),
      (s) => gestureDown(s, at(2, 200, 100), 0),
      (s) => gestureDown(s, at(3, 300, 100), 0),
    ]);
    expect(state.peakFingers).toBe(3);
  });

  it('四指轻点不产出任何单击', () => {
    const { actions } = run([
      (s) => gestureDown(s, at(1, 100, 100), 0),
      (s) => gestureDown(s, at(2, 200, 100), 0),
      (s) => gestureDown(s, at(3, 300, 100), 0),
      (s) => gestureDown(s, at(4, 400, 100), 0),
      (s) => gestureUp(s, 1, 50),
    ]);
    expect(kinds(actions)).not.toContain('tap');
  });

  it('手指一根根慢慢放上去不算单击（起始时刻不因加指而重置）', () => {
    const { actions } = run([
      (s) => gestureDown(s, at(1, 100, 100), 0),
      (s) => gestureDown(s, at(2, 200, 100), 0),
      (s) => gestureDown(s, at(3, 300, 100), 400),
      (s) => gestureUp(s, 1, 450),
    ]);
    expect(kinds(actions)).not.toContain('tap');
  });
});

describe('长按', () => {
  it('按住不动到时长按成立', () => {
    const { state } = run([(s) => gestureDown(s, at(1, 80, 90), 0)]);
    const fired = takeLongPress(state, LONG_PRESS_MS);
    expect(fired.actions).toEqual([{ kind: 'longPress', point: { x: 80, y: 90 } }]);
  });

  it('时长不够不兑现', () => {
    const { state } = run([(s) => gestureDown(s, at(1, 80, 90), 0)]);
    expect(takeLongPress(state, LONG_PRESS_MS - 1).actions).toEqual([]);
  });

  it('被移动打断后不再成立', () => {
    const { state } = run([
      (s) => gestureDown(s, at(1, 80, 90), 0),
      (s) => gestureMove(s, at(1, 200, 90)),
    ]);
    expect(state.longPress).toBeNull();
    expect(takeLongPress(state, LONG_PRESS_MS).actions).toEqual([]);
  });

  it('容差内的抖动不打断长按', () => {
    const { state } = run([
      (s) => gestureDown(s, at(1, 80, 90), 0),
      (s) => gestureMove(s, at(1, 84, 92)),
    ]);
    expect(takeLongPress(state, LONG_PRESS_MS).actions).toHaveLength(1);
  });

  it('同一次按压只兑现一次', () => {
    const { state } = run([(s) => gestureDown(s, at(1, 80, 90), 0)]);
    const first = takeLongPress(state, LONG_PRESS_MS);
    expect(takeLongPress(first.state, LONG_PRESS_MS + 100).actions).toEqual([]);
  });

  it('抬手后不再兑现', () => {
    const { state } = run([
      (s) => gestureDown(s, at(1, 80, 90), 0),
      (s) => gestureUp(s, 1, 100),
    ]);
    expect(takeLongPress(state, LONG_PRESS_MS).actions).toEqual([]);
  });
});

describe('异常事件序列', () => {
  it('pointerId 乱序到达：认不出的 id 一律忽略，不改状态', () => {
    const down = gestureDown(EMPTY_GESTURE, at(1, 100, 100), 0);
    // 7 号手指从未落下，它的 move 不该被采信
    const stray = gestureMove(down.state, at(7, 900, 900));
    expect(stray.state).toBe(down.state);
    expect(stray.actions).toEqual([]);
  });

  it('未知 id 抬手不改状态', () => {
    const down = gestureDown(EMPTY_GESTURE, at(1, 100, 100), 0);
    const stray = gestureUp(down.state, 7, 50);
    expect(stray.state).toBe(down.state);
    expect(stray.actions).toEqual([]);
  });

  it('同一 id 重复落下不在表里留两份', () => {
    const { state } = run([
      (s) => gestureDown(s, at(1, 100, 100), 0),
      (s) => gestureDown(s, at(1, 150, 100), 10),
    ]);
    expect(state.points).toHaveLength(1);
    expect(state.points[0].point.x).toBe(150);
  });

  it('两指重合时不产出离谱的倍率（分母趋零）', () => {
    const { actions } = run([
      (s) => gestureDown(s, at(1, 100, 100), 0),
      (s) => gestureDown(s, at(2, 100, 100), 0),
      (s) => gestureMove(s, at(1, 0, 100)),
      (s) => gestureMove(s, at(2, 200, 100)),
    ]);
    for (const action of actions) {
      if (action.kind === 'pinch') {
        expect(Number.isFinite(action.factor)).toBe(true);
        expect(action.factor).toBeGreaterThan(0);
      }
    }
  });

  it('任何手势产出的数值都不含 NaN', () => {
    const { actions } = run([
      (s) => gestureDown(s, at(1, 100, 100), 0),
      (s) => gestureDown(s, at(2, 200, 140), 0),
      (s) => gestureMove(s, at(1, 60, 80)),
      (s) => gestureMove(s, at(2, 280, 200)),
      (s) => gestureUp(s, 1, 300),
    ]);
    for (const action of actions) {
      if (action.kind === 'pinch') {
        expect(Number.isNaN(action.factor)).toBe(false);
        expect(Number.isNaN(action.focus.x)).toBe(false);
      }
      if (action.kind === 'pan') {
        expect(Number.isNaN(action.dx)).toBe(false);
        expect(Number.isNaN(action.dy)).toBe(false);
      }
    }
  });

  it('指针被系统取消后本次多指阶段不再判定单击', () => {
    const { actions } = run([
      (s) => gestureDown(s, at(1, 100, 100), 0),
      (s) => gestureDown(s, at(2, 200, 100), 0),
      (s) => gestureCancel(s, 2),
      (s) => gestureUp(s, 1, 50),
    ]);
    expect(kinds(actions)).not.toContain('tap');
  });

  it('全部取消后回到空态', () => {
    const { state } = run([
      (s) => gestureDown(s, at(1, 100, 100), 0),
      (s) => gestureCancel(s, 1),
    ]);
    expect(state).toEqual(EMPTY_GESTURE);
  });
});
