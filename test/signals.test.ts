/**
 * graph-memory — 信号检测测试
 *
 * By: adoresever
 * Email: Wywelljob@gmail.com
 */

import { describe, it, expect } from "vitest";
import { detectSignals } from "../src/engine/signals.ts";

describe("detectSignals", () => {
  it("检测工具报错信号", () => {
    const msg = { role: "toolResult", content: "Error: ModuleNotFoundError: No module named pandas" };
    const signals = detectSignals(msg, 3);
    expect(signals.some(s => s.type === "tool_error")).toBe(true);
  });

  it("检测工具成功信号", () => {
    const msg = { role: "toolResult", content: "Successfully installed pandas-2.0.0 in the environment" };
    const signals = detectSignals(msg, 4);
    expect(signals.some(s => s.type === "tool_success")).toBe(true);
  });

  it("检测 assistant 工具调用信号", () => {
    const msg = {
      role: "assistant",
      content: [
        { type: "text", text: "让我执行一下" },
        { type: "tool_use", name: "bash", id: "call-1" },
      ],
    };
    const signals = detectSignals(msg, 5);
    expect(signals.some(s => s.type === "skill_invoked" && s.data.tool === "bash")).toBe(true);
  });

  it("检测用户纠正信号", () => {
    const tests = [
      { role: "user", content: "不对，应该是另一种方式" },
      { role: "user", content: "wrong, try another approach" },
      { role: "user", content: "错了，重新来" },
    ];
    for (const msg of tests) {
      const signals = detectSignals(msg, 6);
      expect(signals.some(s => s.type === "user_correction"), `failed: ${msg.content}`).toBe(true);
    }
  });

  it("检测明确保存信号", () => {
    const msg = { role: "user", content: "记住这个方法" };
    const signals = detectSignals(msg, 7);
    expect(signals.some(s => s.type === "explicit_record")).toBe(true);
  });

  it("检测任务完成信号", () => {
    const msg = { role: "assistant", content: "已完成，所有文件已生成 ✅" };
    const signals = detectSignals(msg, 8);
    expect(signals.some(s => s.type === "task_completed")).toBe(true);
  });

  it("普通对话不产生信号", () => {
    const msg = { role: "user", content: "你好，今天天气怎么样？" };
    const signals = detectSignals(msg, 1);
    expect(signals).toHaveLength(0);
  });

  it("null/undefined 消息返回空", () => {
    expect(detectSignals(null, 0)).toHaveLength(0);
    expect(detectSignals(undefined, 0)).toHaveLength(0);
  });
});
