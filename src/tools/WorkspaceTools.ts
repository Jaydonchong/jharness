import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import z from "zod";
import { AgentTool } from "./core/AgentTool";
import { DomainError, ErrorCode } from "../utils/ErrorCode";

const MAX_FILE_SIZE_BYTES = 1024 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;
const COMMAND_TIMEOUT_MS = 30_000;

const isWithinWorkspace = (workspaceRoot: string, target: string): boolean => {
    const relativePath = path.relative(workspaceRoot, target);
    return (
        relativePath === "" ||
        (!relativePath.startsWith(`..${path.sep}`) &&
            relativePath !== ".." &&
            !path.isAbsolute(relativePath))
    );
};

const resolveWorkspacePath = async (
    workspaceRoot: string,
    requestedPath: string,
    allowMissingFile: boolean,
): Promise<string> => {
    const root = await realpath(workspaceRoot);
    const candidate = path.resolve(root, requestedPath);
    const parent = await realpath(path.dirname(candidate));

    if (!isWithinWorkspace(root, candidate) || !isWithinWorkspace(root, parent)) {
        throw new DomainError(
            ErrorCode.AI_TOOL_CALL_ERROR,
            "File path must stay within the workspace",
        );
    }

    let fileInfo;
    try {
        fileInfo = await lstat(candidate);
    } catch (error) {
        if (
            allowMissingFile &&
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
        ) {
            return path.join(parent, path.basename(candidate));
        }
        throw error;
    }

    if (fileInfo.isSymbolicLink()) {
        const target = await realpath(candidate);
        if (!isWithinWorkspace(root, target)) {
            throw new DomainError(
                ErrorCode.AI_TOOL_CALL_ERROR,
                "File path must stay within the workspace",
            );
        }
        return target;
    }

    return path.join(parent, path.basename(candidate));
};

export const ReadFileInputSchema = z.object({
    path: z.string().min(1).describe("Workspace-relative path of the file to read"),
});

export const ReadFileOutputSchema = z.object({
    content: z.string(),
});

export class ReadFileTool extends AgentTool<
    typeof ReadFileInputSchema,
    typeof ReadFileOutputSchema
> {
    constructor(private readonly workspaceRoot: string) {
        super({
            name: "read_file",
            description: "Read a UTF-8 text file inside the workspace, up to 1 MiB.",
            inputSchema: ReadFileInputSchema,
            outputSchema: ReadFileOutputSchema,
        });
    }

    protected async execute(
        input: z.infer<typeof ReadFileInputSchema>,
    ): Promise<z.infer<typeof ReadFileOutputSchema>> {
        const filePath = await resolveWorkspacePath(
            this.workspaceRoot,
            input.path,
            false,
        );
        const fileInfo = await stat(filePath);
        if (fileInfo.size > MAX_FILE_SIZE_BYTES) {
            throw new DomainError(
                ErrorCode.AI_TOOL_CALL_ERROR,
                "File exceeds the 1 MiB read limit",
            );
        }

        const contents = await readFile(filePath);
        return { content: contents.toString("utf8") };
    }
}

export const WriteFileInputSchema = z.object({
    path: z.string().min(1).describe("Workspace-relative path of the file to write"),
    content: z.string().describe("Complete UTF-8 content to write to the file"),
});

export const WriteFileOutputSchema = z.object({
    bytesWritten: z.number(),
});

export class WriteFileTool extends AgentTool<
    typeof WriteFileInputSchema,
    typeof WriteFileOutputSchema
> {
    constructor(private readonly workspaceRoot: string) {
        super({
            name: "write_file",
            description:
                "Create or replace a UTF-8 text file inside the workspace. This replaces the entire file.",
            inputSchema: WriteFileInputSchema,
            outputSchema: WriteFileOutputSchema,
        });
    }

    protected async execute(
        input: z.infer<typeof WriteFileInputSchema>,
    ): Promise<z.infer<typeof WriteFileOutputSchema>> {
        const filePath = await resolveWorkspacePath(
            this.workspaceRoot,
            input.path,
            true,
        );
        const contentSize = Buffer.byteLength(input.content, "utf8");
        if (contentSize > MAX_FILE_SIZE_BYTES) {
            throw new DomainError(
                ErrorCode.AI_TOOL_CALL_ERROR,
                "Content exceeds the 1 MiB write limit",
            );
        }

        const file = await open(
            filePath,
            constants.O_WRONLY |
                constants.O_CREAT |
                constants.O_TRUNC |
                constants.O_NOFOLLOW,
        );
        try {
            await file.writeFile(input.content, "utf8");
        } finally {
            await file.close();
        }
        return { bytesWritten: contentSize };
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
];
