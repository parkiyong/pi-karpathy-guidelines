# pi-karpathy-guidelines

A [Pi](https://pi.dev) extension that enforces [Andrej Karpathy's coding guidelines](https://x.com/karpathy/status/2015883857489522876) to reduce common LLM coding mistakes.

## Install

```bash
pi install npm:pi-karpathy-guidelines
```

Or from git:

```bash
pi install git:github.com/parkiyong/pi-karpathy-guidelines
```

## Guidelines

The extension injects four behavioral rules into every LLM turn:

1. **Think Before Coding** — State assumptions. Ask when uncertain. Surface tradeoffs.
2. **Simplicity First** — Minimum code that solves the problem. No speculative features or abstractions.
3. **Surgical Changes** — Touch only what's needed. Match existing style. Don't refactor what isn't broken.
4. **Goal-Driven Execution** — Define verifiable success criteria. State a plan with checks.

Derived from Karpathy's [observations on LLM coding pitfalls](https://x.com/karpathy/status/2015883857489522876).

## Active Enforcement

Beyond prompt injection, the extension actively gates tool calls that violate the guidelines:

| Gate | Trigger | Guideline |
|------|---------|-----------|
| Large write | `write` tool > 200 lines | #2 Simplicity First |
| Broad edit | `edit` tool > 5 blocks | #3 Surgical Changes |

Both gates prompt for confirmation before allowing the operation through. The LLM receives the guideline-specific reason if blocked.

## Commands

| Command | Description |
|---------|-------------|
| `/karpathy` | Toggle on/off — shows 🧠 in footer when active |
| `/karpathy-check` | Ask the LLM to self-critique its last response against all 4 guidelines |

The extension is **enabled by default**. Use `/karpathy` to turn it off for trivial tasks where the caution bias isn't useful.

## How it works

- **`before_agent_start`** — Appends the full guidelines to the system prompt each turn.
- **`tool_call`** — Intercepts `write` and `edit` calls, checks thresholds, prompts for confirmation.
- **`/karpathy-check`** — Sends a self-review prompt referencing the last assistant message.

## License

[MIT](LICENSE)
