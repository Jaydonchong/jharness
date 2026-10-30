import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import {
    lstat,
    readdir,
    realpath,
    writeFile,
} from "node:fs/promises";
import path from "node:path";
import z from "zod";
import { AgentTool } from "./core/AgentTool";
import { DomainError, ErrorCode } from "../utils/ErrorCode";

const MAX_FILE_SIZE_BYTES = 1024 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;
const COMMAND_TIMEOUT_MS = 30_000;
const MAX_WALK_ENTRIES = 500;

const resolveAbsolutePath = (requestedPath: string): string => {
    if (!path.isAbsolute(requestedPath)) {
        throw new DomainError(
            ErrorCode.AI_TOOL_CALL_ERROR,
            "File path must be absolute",
        );
    }

    return path.normalize(requestedPath);
};

export const ReadFileInputSchema = z.object({
    path: z.string().min(1).describe("Absolute path of the file to read"),
});

export const ReadFileOutputSchema = z.object({
    content: z.string(),
});

export class ReadFileTool extends AgentTool<
    typeof ReadFileInputSchema,
    typeof ReadFileOutputSchema
> {
    constructor() {
        super({
            name: "read_file",
            description: "Read a UTF-8 text file at an absolute path, up to 1 MiB.",
            inputSchema: ReadFileInputSchema,
            outputSchema: ReadFileOutputSchema,
        });
    }

    protected async execute(
        input: z.infer<typeof ReadFileInputSchema>,
    ): Promise<z.infer<typeof ReadFileOutputSchema>> {
        const filePath = resolveAbsolutePath(input.path);
        const file = await open(
            filePath,
            constants.O_RDONLY | constants.O_NONBLOCK,
        );
        try {
            const fileInfo = await file.stat();
            if (!fileInfo.isFile()) {
                throw new DomainError(
                    ErrorCode.AI_TOOL_CALL_ERROR,
                    "Path must point to a regular file",
                );
            }
            if (fileInfo.size > MAX_FILE_SIZE_BYTES) {
                throw new DomainError(
                    ErrorCode.AI_TOOL_CALL_ERROR,
                    "File exceeds the 1 MiB read limit",
                );
            }

            const contents = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1);
            let bytesRead = 0;
            while (bytesRead < contents.byteLength) {
                const result = await file.read(
                    contents,
                    bytesRead,
                    contents.byteLength - bytesRead,
                    bytesRead,
                );
                if (result.bytesRead === 0) break;
                bytesRead += result.bytesRead;
            }
            if (bytesRead > MAX_FILE_SIZE_BYTES) {
                throw new DomainError(
                    ErrorCode.AI_TOOL_CALL_ERROR,
                    "File exceeds the 1 MiB read limit",
                );
            }
            return {
                content: contents.subarray(0, bytesRead).toString("utf8"),
            };
        } finally {
            await file.close();
        }
    }
}

export const WriteFileInputSchema = z.object({
    path: z.string().min(1).describe("Absolute path of the file to write"),
    content: z.string().describe("Complete UTF-8 content to write to the file"),
});

export const WriteFileOutputSchema = z.object({
    bytesWritten: z.number(),
});

export class WriteFileTool extends AgentTool<
    typeof WriteFileInputSchema,
    typeof WriteFileOutputSchema
> {
    constructor() {
        super({
            name: "write_file",
            description:
                "Create or replace a UTF-8 text file at an absolute path. This replaces the entire file.",
            inputSchema: WriteFileInputSchema,
            outputSchema: WriteFileOutputSchema,
        });
    }

    protected async execute(
        input: z.infer<typeof WriteFileInputSchema>,
    ): Promise<z.infer<typeof WriteFileOutputSchema>> {
        const filePath = resolveAbsolutePath(input.path);
        const contentSize = Buffer.byteLength(input.content, "utf8");
        if (contentSize > MAX_FILE_SIZE_BYTES) {
            throw new DomainError(
                ErrorCode.AI_TOOL_CALL_ERROR,
                "Content exceeds the 1 MiB write limit",
            );
        }

        await writeFile(filePath, input.content, "utf8");
        return { bytesWritten: contentSize };
    }
}

export const WalkDirectoryInputSchema = z.object({
    path: z.string().min(1).describe("Absolute path of the directory to walk"),
    maxDepth: z.number().int().min(1).max(8).optional(),
});

export const WalkDirectoryOutputSchema = z.object({
    entries: z.array(
        z.object({
            path: z.string(),
            type: z.enum(["file", "directory", "symlink", "other"]),
        }),
    ),
    truncated: z.boolean(),
});

export class WalkDirectoryTool extends AgentTool<
    typeof WalkDirectoryInputSchema,
    typeof WalkDirectoryOutputSchema
> {
    constructor() {
        super({
            name: "walk_directory",
            description:
                "List files and directories under an absolute directory path. Symlink entries are listed and skipped during traversal. Concurrent filesystem changes can affect path-based traversal; this tool is not a filesystem sandbox. Results are limited to 500 entries and depth 3 by default.",
            inputSchema: WalkDirectoryInputSchema,
            outputSchema: WalkDirectoryOutputSchema,
        });
    }

    protected async execute(
        input: z.infer<typeof WalkDirectoryInputSchema>,
    ): Promise<z.infer<typeof WalkDirectoryOutputSchema>> {
        const requestedRoot = resolveAbsolutePath(input.path);
        const maxDepth = input.maxDepth ?? 3;
        const entries: z.infer<typeof WalkDirectoryOutputSchema>["entries"] = [];
        let truncated = false;

        const rootInfo = await lstat(requestedRoot);
        if (rootInfo.isSymbolicLink()) {
            return {
                entries: [{ path: requestedRoot, type: "symlink" }],
                truncated,
            };
        }
        if (!rootInfo.isDirectory()) {
            throw new DomainError(
                ErrorCode.AI_TOOL_CALL_ERROR,
                "Path must point to a directory",
            );
        }
        const visit = async (directory: string, depth: number): Promise<void> => {
            const children = await readdir(directory, { withFileTypes: true });
            for (const child of children) {
                if (entries.length >= MAX_WALK_ENTRIES) {
                    truncated = true;
                    return;
                }

                const childPath = path.join(directory, child.name);
                const type = child.isDirectory()
                    ? "directory"
                    : child.isFile()
                      ? "file"
                      : child.isSymbolicLink()
                        ? "symlink"
                        : "other";
                entries.push({ path: childPath, type });

                if (type === "directory") {
                    const currentInfo = await lstat(childPath);
                    if (currentInfo.isSymbolicLink()) {
                        entries[entries.length - 1].type = "symlink";
                        continue;
                    }
                    if (!currentInfo.isDirectory()) continue;

                    if (depth < maxDepth) {
                        await visit(childPath, depth + 1);
                        if (truncated) return;
                    } else if ((await readdir(childPath)).length > 0) {
                        truncated = true;
                    }
                }
            }
        };

        await visit(requestedRoot, 1);
        return { entries, truncated };
    }
}

export const ShellCommandInputSchema = z.object({
    command: z.string().min(1).describe("Bash command to run inside the workspace"),
});

export const ShellCommandOutputSchema = z.object({
    exitCode: z.number().nullable(),
    stdout: z.string(),
    stderr: z.string(),
});

export class ShellCommandTool extends AgentTool<
    typeof ShellCommandInputSchema,
    typeof ShellCommandOutputSchema
> {
    constructor(private readonly workspaceRoot: string) {
        super({
            name: "run_shell_command",
            description:
                "Run a Bash command in the workspace. Commands time out after 30 seconds and output is capped at 1 MiB.",
            inputSchema: ShellCommandInputSchema,
            outputSchema: ShellCommandOutputSchema,
        });
    }

    protected async execute(
        input: z.infer<typeof ShellCommandInputSchema>,
    ): Promise<z.infer<typeof ShellCommandOutputSchema>> {
        const cwd = await realpath(this.workspaceRoot);

        return new Promise((resolve, reject) => {
            execFile(
                "bash",
                ["-c", input.command],
                {
                    cwd,
                    encoding: "utf8",
                    maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
                    timeout: COMMAND_TIMEOUT_MS,
                },
                (error, stdout, stderr) => {
                    if (!error) {
                        resolve({ exitCode: 0, stdout, stderr });
                        return;
                    }

                    if ("code" in error && typeof error.code === "number") {
                        resolve({ exitCode: error.code, stdout, stderr });
                        return;
                    }

                    reject(error);
                },
            );
        });
    }
}

export type WorkspaceTools = [
    ReadFileTool,
    WriteFileTool,
    ShellCommandTool,
    WalkDirectoryTool,
];
