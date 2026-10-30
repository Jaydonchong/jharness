import { writeFile } from "node:fs/promises";
import z from "zod";
import { AgentTool } from "../core/AgentTool";
import { MAX_FILE_SIZE_BYTES, resolveAbsolutePath } from "./WorkspaceFileUtils";
import { DomainError, ErrorCode } from "../../utils/ErrorCode";

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
