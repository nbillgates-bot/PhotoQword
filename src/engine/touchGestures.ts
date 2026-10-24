/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 触屏手势识别：多点位置进，手势语义出。
 *
 * **为什么单独抽一层：** 触屏没有滚轮、没有修饰键、没有右键，缩放平移撤销
 * 全靠手指数量和位移区分。这套判定条件（多少位移算拖、多久算长按、
 * 几根手指算撤销）散在组件里就没法测，也没法两处复用。
 *
 * 纯函数 + 不可变状态：不认识 DOM、不认识 store、不认识 rAF。
 * 时间由调用方以 `now` 传入，定时器也由调用方持有（见 hooks/useTouchGestures.ts）。
 *
 * 手势映射对齐 PS on iPad（决策见 docs/TODO_MOBILE.md）：
 * 单指拖 = 当前工具，双指拖 = 平移，双指捏合 = 缩放，
 * 双指单击 = 撤销，三指单击 = 重做，长按 = 上下文菜单（替代右键）。
 */

import type { Point } from '../types';
import { centroid, spreadOf, type TouchPoint } from './touchGeometry';

export type { TouchPoint };

/** 长按判定时长。与 PS on iPad 的上下文菜单一致，也是各家触屏的通行值 */
export const LONG_PRESS_MS = 500;

/**
 * 多指「单击」的最长时长。
 *
 * 有上限才能把「双指轻点一下撤销」和「双指按住停顿后再拖」分开：
 * 后者按住超过这个时间就不再算单击，抬手不会误撤销。
 */
export const MULTI_TAP_MAX_MS = 300;

/**
 * 单指位移容差（视口像素）。超过它就不再算长按候选。
 *
 * 手指按在屏幕上必然有几像素抖动，容差太小会让长按几乎按不出来。
 */
export const LONG_PRESS_SLOP = 10;

/** 多指中心位移容差。超过它算「拖过了」，抬手不再判定为单击 */
export const MULTI_SLOP = 10;

/** 多指张开度变化容差（视口像素）。捏合超过它同样算拖过了 */
export const SPREAD_SLOP = 6;

/**
 * 识别出来的手势。只描述「发生了什么」，不含「应该做什么」——
 * 撤销/重做这类语义映射留给上层（见 hooks/useTouchGestures.ts），
 * 这一层不认识 store。
 */
export type GestureAction =
  /** 捏合。factor 是相对倍率（>1 放大），focus 是两指中点（视口坐标） */
  | { kind: 'pinch'; factor: number; focus: Point }
  /** 多指拖动。dx/dy 是中点位移（视口像素），方向与手指一致 */
  | { kind: 'pan'; dx: number; dy: number }
  /** 多指单击。fingers 只会是 2 或 3 */
  | { kind: 'tap'; fingers: 2 | 3 }
  /** 长按到时。point 是按下位置（视口坐标） */
  | { kind: 'longPress'; point: Point }
  /**
   * 第二根手指落下，单指那一笔要作废。
   *
   * 没有它的话，双指平移会在画布上留下第一根手指画出的半截笔画 ——
   * 手势开始的那一刻，用户的意图已经从「画」变成「移动视图」了。
   */
  | { kind: 'cancelStroke' };

/**
 * 手势识别状态。**不可变**，所有函数都返回新对象。
 *
 * points 保持落指顺序：第一根手指要能被认出来（长按只认它），
 * 而 pointerId 在各浏览器上既不保证连续也不保证递增，不能拿它排序。
 */
export interface GestureState {
  points: TouchPoint[];
  /** 是否处于多指阶段（≥2 指）。抬到只剩 1 指也不回到单指语义 */
  multi: boolean;
  /** 上一次的中点与张开度，用来算增量。多指阶段外为 null */
  prevCenter: Point | null;
  prevSpread: number;
  /** 进入多指阶段那一刻的中点与张开度，用来判定「拖过了没有」 */
  originCenter: Point | null;
  originSpread: number;
  /** 多指阶段的起始时刻，配合 MULTI_TAP_MAX_MS 判定单击 */
  multiStart: number;
  /** 本次多指阶段最多同时有几根手指。单击语义按它分派 */
  peakFingers: number;
  /** 是否已经拖/捏过。拖过就不再判定为单击 */
  moved: boolean;
  /** 本次多指阶段是否已经发过单击，避免逐根抬手发好几次 */
  tapEmitted: boolean;
  /** 长按候选：第一根手指的落点。被移动、被第二根手指、被抬手清掉 */
  longPress: { id: number; point: Point; start: number } | null;
}

/** 空态。**不要直接改它**，所有操作都返回新对象 */
export const EMPTY_GESTURE: GestureState = Object.freeze({
  points: Object.freeze([]) as unknown as TouchPoint[],
  multi: false,
  prevCenter: null,
  prevSpread: 0,
  originCenter: null,
  originSpread: 0,
  multiStart: 0,
  peakFingers: 0,
  moved: false,
  tapEmitted: false,
  longPress: null,
});

/** 识别结果：新状态 + 这一步产生的手势 */
export interface GestureStep {
  state: GestureState;
  actions: GestureAction[];
}

/**
 * 落指。
 *
 * 第一根手指只是「候选」：既可能是工具落笔，也可能是长按，还可能是双指手势
 * 的第一根，此刻无法判断，所以除了记下位置什么都不做。第二根落下才有得判。
 */
export function gestureDown(state: GestureState, touch: TouchPoint, now: number): GestureStep {
  // 同 id 重复落下（异常事件序列）按覆盖处理，不要在 points 里留两份
  const points = [...state.points.filter((item) => item.id !== touch.id), touch];
  const actions: GestureAction[] = [];

  if (points.length < 2) {
    return {
      state: {
        ...EMPTY_GESTURE,
        points,
        longPress: { id: touch.id, point: touch.point, start: now },
      },
      actions,
    };
  }

  // 单指 -> 多指：单指那一笔作废，并开一段新的多指阶段
  const entering = !state.multi;
  if (entering) actions.push({ kind: 'cancelStroke' });

  /*
   * 每次指数变化都重置基准（中点/张开度/原点）。
   * 不重置的话，第三根手指落下会让中点与张开度突变，被当成一次巨大的
   * 平移加缩放，画面直接跳走。
   */
  const center = centroid(points);
  return {
    state: {
      points,
      multi: true,
      prevCenter: center,
      prevSpread: spreadOf(points),
      originCenter: center,
      originSpread: spreadOf(points),
      // 起始时刻只在进入多指阶段时定，中途加手指不重置：
      // 手指一根根慢慢放上去本来就不该算「单击」
      multiStart: entering ? now : state.multiStart,
      peakFingers: Math.max(state.peakFingers, points.length),
      moved: entering ? false : state.moved,
      tapEmitted: entering ? false : state.tapEmitted,
      // 多指手势里长按没有语义，候选直接作废
      longPress: null,
    },
    actions,
  };
}

/**
 * 张开度小于这个值就不算捏合。
 *
 * 两指几乎重合时「新旧张开度之比」在数值上毫无意义（分母趋零，倍率能到几百），
 * 拿它去乘 zoom 会让画面瞬间飞掉。
 */
const MIN_SPREAD = 1;

/** 移动。单指只用来判长按是否还成立，多指才产出缩放与平移 */
export function gestureMove(state: GestureState, touch: TouchPoint): GestureStep {
  // 认不出的 id 一律忽略：pointerId 乱序到达、或抬手后仍有残留 move 事件时
  // 不能凭它去改状态，否则会算出一个跳变的中点
  if (!state.points.some((item) => item.id === touch.id)) return { state, actions: [] };

  const points = state.points.map((item) => (item.id === touch.id ? touch : item));

  if (!state.multi) {
    const candidate = state.longPress;
    // 手指挪出容差就不再是长按，是拖动
    const drifted =
      candidate !== null &&
      Math.hypot(touch.point.x - candidate.point.x, touch.point.y - candidate.point.y) >
        LONG_PRESS_SLOP;
    return {
      state: { ...state, points, longPress: drifted ? null : candidate },
      actions: [],
    };
  }

  /*
   * 多指阶段里抬到只剩一根手指：位置照记，但不再产出缩放与平移。
   *
   * 剩下那根手指既不该接着平移视图（用户已经在收手了），也不该开始画画
   * （落笔的意图早在第二根手指落下时就作废了）。全部抬起才回到单指语义。
   */
  if (points.length < 2) return { state: { ...state, points }, actions: [] };

  const center = centroid(points);
  const spread = spreadOf(points);
  const moved =
    state.moved ||
    (state.originCenter !== null &&
      Math.hypot(center.x - state.originCenter.x, center.y - state.originCenter.y) > MULTI_SLOP) ||
    Math.abs(spread - state.originSpread) > SPREAD_SLOP;

  /*
   * 没过容差就只更新位置，基准原地不动。
   *
   * 这样一旦过了容差，第一次发出的增量把攒下的那点位移一并带上，
   * 画面与手指严格同步；否则视图会永远落后手指一个容差的距离。
   */
  if (!moved) return { state: { ...state, points }, actions: [] };

  const actions: GestureAction[] = [];
  const prevSpread = state.prevSpread;
  if (prevSpread > MIN_SPREAD && spread > MIN_SPREAD) {
    const factor = spread / prevSpread;
    if (factor !== 1) actions.push({ kind: 'pinch', factor, focus: center });
  }
  const prev = state.prevCenter ?? center;
  const dx = center.x - prev.x;
  const dy = center.y - prev.y;
  // 缩放在前、平移在后：与 store 的 nudgeView 内部顺序一致，
  // 反过来会把平移量当成缩放前的位移，焦点就跑了
  if (dx !== 0 || dy !== 0) actions.push({ kind: 'pan', dx, dy });

  return {
    state: { ...state, points, prevCenter: center, prevSpread: spread, moved: true },
    actions,
  };
}

/**
 * 抬指。多指阶段抬手时判定「单击」——没拖过、时间够短，就是撤销/重做。
 *
 * 判定放在**第一根**手指抬起时：两根手指不可能同时离屏，等最后一根反而
 * 会把先抬的那根算成「手指变少」的正常过程，判据全乱。
 */
export function gestureUp(state: GestureState, id: number, now: number): GestureStep {
  if (!state.points.some((item) => item.id === id)) return { state, actions: [] };
  const points = state.points.filter((item) => item.id !== id);
  const actions: GestureAction[] = [];

  if (state.multi) {
    const quick = now - state.multiStart <= MULTI_TAP_MAX_MS;
    const fingers = state.peakFingers;
    if (!state.moved && !state.tapEmitted && quick && (fingers === 2 || fingers === 3)) {
      actions.push({ kind: 'tap', fingers });
    }
    // 全抬起才回空态；还有手指在屏上就保住 multi，避免残留的手指开始画画
    if (points.length === 0) return { state: EMPTY_GESTURE, actions };
    const center = centroid(points);
    return {
      state: {
        ...state,
        points,
        prevCenter: center,
        prevSpread: spreadOf(points),
        originCenter: center,
        originSpread: spreadOf(points),
        tapEmitted: state.tapEmitted || actions.length > 0,
      },
      actions,
    };
  }

  if (points.length === 0) return { state: EMPTY_GESTURE, actions };
  // 单指阶段抬手（正常不会发生：只有一根手指时抬起就是全抬起）
  return { state: { ...state, points, longPress: null }, actions };
}

/**
 * 长按到时的兑现。定时器由调用方持有，到点调这里问一句「还算长按吗」。
 *
 * 候选可能已经被移动、被第二根手指、被抬手清掉，所以必须回来问一次，
 * 不能让定时器自己直接开菜单。
 */
export function takeLongPress(state: GestureState, now: number): GestureStep {
  const candidate = state.longPress;
  if (!candidate || state.multi) return { state, actions: [] };
  // 时长不够就不兑现（定时器被提前触发时的保险）
  if (now - candidate.start < LONG_PRESS_MS) return { state, actions: [] };
  return {
    // 兑现后清掉候选：同一次按压只出一次菜单
    state: { ...state, longPress: null },
    actions: [{ kind: 'longPress', point: candidate.point }],
  };
}

/** 指针被系统取消（来电、手势被系统接管）。按抬手处理，但不判定单击 */
export function gestureCancel(state: GestureState, id: number): GestureStep {
  const points = state.points.filter((item) => item.id !== id);
  if (points.length === 0) return { state: EMPTY_GESTURE, actions: [] };
  const center = centroid(points);
  return {
    state: {
      ...state,
      points,
      prevCenter: center,
      prevSpread: spreadOf(points),
      originCenter: center,
      originSpread: spreadOf(points),
      longPress: null,
      // 取消过就不再判定单击：这次多指阶段已经不干净了
      tapEmitted: true,
    },
    actions: [],
  };
}
