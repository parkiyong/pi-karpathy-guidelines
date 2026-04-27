/**
 * Karpathy Guidelines Extension
 *
 * Enforces Andrej Karpathy's coding guidelines to reduce common LLM mistakes:
 * 1. Think Before Coding — surface assumptions, ask when uncertain
 * 2. Simplicity First — minimum code, nothing speculative
 * 3. Surgical Changes — touch only what's needed
 * 4. Goal-Driven Execution — define verifiable success criteria
 *
 * Features:
 * - Injects guidelines into the system prompt via before_agent_start
 * - /karpathy command to toggle enforcement on/off
 * - /karpathy-check command to review the last assistant response against guidelines
 * - tool_call hook that flags large writes as potential over-engineering
 *
 * Based on: https://x.com/karpathy/status/2015883857489522876
 *
 * Usage:
 *   pi -e .pi/extensions/karpathy-guidelines.ts
 *   Or place in .pi/extensions/ for auto-discovery
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

const KARPATHY_GUIDELINES = `
## Karpathy Coding Guidelines

You MUST follow these behavioral guidelines in all code generation, review, and refactoring tasks.

### 1. Think Before Coding
- State your assumptions explicitly. If uncertain, ask the user.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First
- Write the minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes
- Touch only what you must. Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken. Match existing style.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.
- Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution
- Transform tasks into verifiable goals with success criteria.
- For multi-step tasks, state a brief plan with verification steps:
  1. [Step] → verify: [check]
  2. [Step] → verify: [check]
  3. [Step] → verify: [check]
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"
`;

/** Threshold (in lines) above which a write tool call triggers a size warning. */
const LARGE_WRITE_THRESHOLD = 200;

export default function karpathyGuidelines(pi: ExtensionAPI) {
	let enabled = true;

	// ── Toggle command ─────────────────────────────────────────────────
	pi.registerCommand("karpathy", {
		description: "Toggle Karpathy coding guidelines enforcement",
		handler: async (_args, ctx) => {
			enabled = !enabled;
			const state = enabled ? "enabled ✓" : "disabled ✗";
			ctx.ui.notify(`Karpathy guidelines: ${state}`, "info");
			ctx.ui.setStatus("karpathy", enabled ? "🧠 Karpathy" : undefined);
		},
	});

	// ── Status indicator on session start ──────────────────────────────
	pi.on("session_start", async (_event, ctx) => {
		if (enabled) {
			ctx.ui.setStatus("karpathy", "🧠 Karpathy");
		}
	});

	// ── Inject guidelines into system prompt ───────────────────────────
	pi.on("before_agent_start", async (event) => {
		if (!enabled) return undefined;

		return {
			systemPrompt: event.systemPrompt + KARPATHY_GUIDELINES,
		};
	});

	// ── Flag suspiciously large writes ─────────────────────────────────
	pi.on("tool_call", async (event, ctx) => {
		if (!enabled) return undefined;

		// Flag large write operations (guideline 2: Simplicity First)
		if (isToolCallEventType("write", event)) {
			const content = event.input.content as string;
			const lineCount = content.split("\n").length;
			if (lineCount > LARGE_WRITE_THRESHOLD) {
				if (ctx.hasUI) {
					const ok = await ctx.ui.confirm(
						`⚠️ Large write: ${lineCount} lines`,
						`Karpathy Guideline #2 (Simplicity First): This write has ${lineCount} lines.\n` +
							`Could it be simpler? Allow anyway?`,
					);
					if (!ok) {
						return { block: true, reason: `Blocked: ${lineCount}-line write flagged by Karpathy guideline #2 (Simplicity First). Consider if this could be shorter.` };
					}
				}
			}
		}

		// Flag large edits with many change blocks (guideline 3: Surgical Changes)
		if (isToolCallEventType("edit", event)) {
			const edits = event.input.edits as Array<{ oldText: string; newText: string }>;
			if (edits && edits.length > 5) {
				if (ctx.hasUI) {
					const ok = await ctx.ui.confirm(
						`⚠️ ${edits.length} edit blocks`,
						`Karpathy Guideline #3 (Surgical Changes): This edit has ${edits.length} blocks.\n` +
							`Are all of these directly tied to the user's request? Allow anyway?`,
					);
					if (!ok) {
						return { block: true, reason: `Blocked: ${edits.length}-block edit flagged by Karpathy guideline #3 (Surgical Changes). Every changed line should trace to the user's request.` };
					}
				}
			}
		}

		return undefined;
	});

	// ── /karpathy-check: review last response against guidelines ──────
	pi.registerCommand("karpathy-check", {
		description: "Review the last assistant response against Karpathy guidelines",
		handler: async (_args, ctx) => {
			const branch = ctx.sessionManager.getBranch();

			// Find the last assistant message
			let lastAssistant: string | null = null;
			for (let i = branch.length - 1; i >= 0; i--) {
				const entry = branch[i];
				if (entry.type === "message" && entry.message.role === "assistant") {
					const content = entry.message.content;
					if (Array.isArray(content)) {
						lastAssistant = content
							.filter((c: { type: string }) => c.type === "text")
							.map((c: { type: string; text?: string }) => c.text ?? "")
							.join("\n");
					} else if (typeof content === "string") {
						lastAssistant = content;
					}
					break;
				}
			}

			if (!lastAssistant) {
				ctx.ui.notify("No assistant message found to review.", "warning");
				return;
			}

			// Send a review prompt to the LLM
			pi.sendUserMessage(
				`Review your last response against these Karpathy guidelines and self-critique honestly. Be specific about any violations:\n\n` +
					`1. **Think Before Coding** — Did you state assumptions? Did you ask about ambiguity?\n` +
					`2. **Simplicity First** — Is there any unnecessary code, abstractions, or error handling?\n` +
					`3. **Surgical Changes** — Did you touch anything beyond what was asked? Any gratuitous cleanup?\n` +
					`4. **Goal-Driven Execution** — Did you define verifiable success criteria?\n\n` +
					`If you find violations, explain what you'd do differently. Be concise.`,
			);
		},
	});
}
