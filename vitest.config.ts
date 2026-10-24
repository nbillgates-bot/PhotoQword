/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // engine 层大量操作真实 canvas，jsdom 配 node-canvas 才能拿到可用的 2D 上下文
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    restoreMocks: true,
    /*
     * 默认的 5s 不够。渲染类用例（局部缓冲对照、随机结构对照、见证测试）要把
     * 几十上百棵图层树各渲好几遍，单跑 6~7s，整套并行跑时更慢——于是同一批用例
     * 时红时绿，看着像 flaky，实际从来不是像素分歧，是墙上时间不够。
     *
     * 放在这里而不是逐个用例传：超时快慢取决于机器负载，不是某个用例的性质，
     * 逐个传等于把同一个理由抄很多遍，以后加一个重用例又要再想一次。
     */
    testTimeout: 30_000,
  },
});
