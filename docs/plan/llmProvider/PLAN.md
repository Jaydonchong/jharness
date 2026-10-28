# LLM Provider Integrations Plan

## Goal

Integrate OpenCode and OpenAI as two separate providers under `src/network/llmProviders`.

Both integrations must preserve the existing `ILlmProvider` contract for non-streaming generation, streaming generation, tool calls, structured output, and stop-reason handling.

Each task uses the existing `ILlmProvider` behavior and `AgentSession` expectations as its acceptance baseline.

The contract checks cover generation, streamed text and completion metadata, tool-call turns and continuation, structured output, stop reasons, and `DomainError` mapping.

## Current boundary

`src/network/llmProviders/Interfaces.ts` defines `ILlmProvider`, `ILlmGenerateTextOutput`, and `ILlmStreamTextOutput`.

`src/network/llmProviders/VercelSDK.ts` implements both generation paths and maps tools, structured output, and SDK errors.

`src/harness/AgentSession.ts` consumes `ILlmProvider` and controls the tool-call loop.

`src/index.ts` currently selects `VercelSDK` and a model at application startup.

## Assumption to validate

OpenCode means connecting to an OpenCode server through its TypeScript SDK.

OpenCode's documented SDK controls OpenCode sessions and prompts, while `ILlmProvider` accepts messages and application-defined tools for one model turn.

The OpenCode task must verify that the server SDK can preserve the existing contract before treating OpenCode as an `ILlmProvider` implementation.

If the contracts do not align, stop that task at the compatibility finding and propose the smallest required boundary change before implementation.

## Task sequence

| ID | Task | Owner | Estimate | Depends on | Done when |
| --- | --- | --- | --- | --- | --- |
| LP-1 | OpenCode provider integration | Jaydon | 1–2 days | None | OpenCode compatibility with `ILlmProvider` is recorded; the adapter passes the shared provider contract checks for generation, streaming, tool calls, structured output, and stop reasons; OpenCode configuration and connection failures map to `DomainError`. |
| LP-2 | OpenAI provider integration | Jaydon | 1–2 days | None | The OpenAI adapter passes the shared provider contract checks for generation, streaming, tool calls, structured output, and stop reasons; credentials and request failures map to `DomainError`; startup can select OpenAI without changing `AgentSession`. |

The tasks are independent and can run in parallel.

## Work order

1. Run LP-1's OpenCode compatibility check first because OpenCode's documented session API may not represent the model-turn abstraction in `ILlmProvider`.
2. Implement LP-1 only if the compatibility check succeeds without changing the harness contract.
3. Implement LP-2 using the official OpenAI AI SDK provider and the existing provider behavior as its acceptance baseline.
4. Wire each provider into startup selection independently, keeping `VercelSDK` available.
5. Run the build and provider contract checks for each integration, then record any live-account checks separately from mocked checks.

## Risks and checkpoints

- OpenCode may own agent sessions, model selection, and tool execution on its server, which may not map cleanly to the existing client-owned tool loop.
- OpenAI structured output and tool-call behavior must match the installed AI SDK version and selected OpenAI API mode.
- Live OpenCode or OpenAI credentials are not required for the adapter contract checks; document any behavior that remains unverified without live credentials.

## References

- [OpenCode TypeScript SDK](https://docs.opencode.ai/docs/sdk/)
- [OpenCode server](https://docs.opencode.ai/docs/server/)
- [AI SDK OpenAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai)
