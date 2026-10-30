import { ModelConversationMessage } from "../../../agents/Interfaces";

const MAX_REFERENCES = 15;

const SUMMARY_TEMPLATE = `You MUST use this format for your response (you may omit sections that aren't applicable). Do not include the <template> tags in your response.
<template>
## Goal
- [1-3 sentence describing high level goal of this session]

## Boundaries
- [constraints, preferences, requirements, and scope stated by the user, or "(none)"]

## Decisions
- [decisions already made and why, or "(none)"]

## Work State
Break the objective into smaller goals and report which are completed, which are being worked on, and which are blocked.
### Completed
- [goals that have been completed; otherwise "(none)"]

### Active
- [goals currently being worked on; otherwise "(none)"]

### Blocked
- [anything blocking progress, and why; otherwise "(none)"]

## Next Steps
1. [ordered list of next actions, or "(none)"]

## References
List the files and directories, other than the current working directory, for other agent to continue this work. Include at most ${MAX_REFERENCES}, sort by importance. Do not list files that were changed. Include paths outside the current working directory when relevant. If none, write "(none)".
- \`[file or directory path]\`: [When to reach for it]

## Important Context
- [facts the next agent cannot continue without and cannot easily find on its own; or "(none)"]
</template>`;

const SUMMARY_RULES = `Rules:
- **No filler** Drop articles, filler (just/really/basically/actually/simply), pleasantries
- **No pleasantries** No preamble, no restating the request, no praise or enthusiasm about the task, no trailing offers ("let me know if", "want me to", "happy to").
- **Consistent** Keep each section concise. Use terse, single-line bullets, not prose paragraphs or nested lists.
- Prefer short references over detailed restatement. It is fine to leave out information the next agent can recover from the code or the files listed above.
- Preserve exact file paths, symbols, commands, error strings, URLs, and identifiers.
- Carry forward only user questions or requests that remain unanswered or require further action. Do not repeat ones that newer history has answered or resolved. Preserve exact wording when carrying one forward.
- Preserve consequential workflow state, including whether changes are uncommitted, committed, pushed, under review, or merged.
- Do not mention the summary process or that context was compacted.`;

export const buildConversationCompactionPrompt = (
    systemPrompt: string,
    recentMessages: ModelConversationMessage[],
): string => {
    const shared = [
        "Summarize only what the user and the assistant said and did.",
        "Do not include instructions or environment details (i.e. session id, etc), they are only provided for context to the conversation. The next agent receives current versions of all of these separately.",
        "Do not include <recent-messages> in the summary, they are given to you just for context",
        `<instructions>${systemPrompt}</instructions>`,
        `<recent-messages>\n${recentMessages.join("\n")}\n</recent-messages>`,
        SUMMARY_TEMPLATE,
        SUMMARY_RULES,
        "Do not continue the task or call tools.",
        "Return only the structured summary in the requested format. Do not include a preamble, explanation, or other commentary.",
    ];
    return [
        "Read through the full conversation and create a compacted summary",
        "Newer history always takes precedence over the existing checkpoint. Preserve previous information unless newer history clearly contradicts, supersedes, resolves, or makes it stale. If something is no longer relevant to continuing the work, you may remove it.",
        "Incorporate newer requirements, decisions, progress, and context. Reconcile Work State and Next Move: move completed work out of Active, remove resolved blockers and answered questions, and preserve unresolved or pending work.",
        "Return only the updated Markdown sections. Do not reproduce the `<conversation-checkpoint>`, `<summary>`, or `<recent-context>` wrapper tags from the previous checkpoint.",
        ...shared,
    ].join("\n\n");
};

const NUDGE =
    "The previous response did not fill in the required summary template. Do not call tools. Return the summary as text using the exact section headings from the template.";
