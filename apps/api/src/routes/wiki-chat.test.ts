import { describe, expect, test } from "bun:test";

process.env.CLERK_SECRET_KEY ??= "sk_test_placeholder";
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??= `pk_test_${btoa("clerk.example.com$")}`;

const { recentHistory } = await import("./wiki-chat.js");

const turn = (role: "user" | "assistant", chars: number) => ({ role, content: "x".repeat(chars) });

describe("long chats", () => {
  test("a short chat goes to the model whole", () => {
    const history = [turn("user", 10), turn("assistant", 10), turn("user", 10)];
    expect(recentHistory(history)).toEqual({ kept: history, dropped: 0 });
  });

  test("a long one keeps its newest part, starting on a question", () => {
    const history = [
      turn("user", 90_000),
      turn("assistant", 90_000),
      turn("user", 90_000),
      turn("assistant", 90_000),
      turn("user", 10),
    ];
    const { kept, dropped } = recentHistory(history);
    expect(dropped).toBe(2);
    expect(kept[0].role).toBe("user");
    expect(kept.at(-1)).toBe(history[4]);
  });

  test("the newest question is kept however long it is", () => {
    const history = [turn("user", 10), turn("assistant", 10), turn("user", 500_000)];
    expect(recentHistory(history).kept).toEqual([history[2]]);
  });
});
