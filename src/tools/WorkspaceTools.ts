import type { ReadFileTool } from "./ReadFileTool";
import type { ShellCommandTool } from "./ShellCommandTool";
import type { WalkDirectoryTool } from "./WalkDirectoryTool";
import type { WriteFileTool } from "./WriteFileTool";

export { ReadFileInputSchema, ReadFileOutputSchema, ReadFileTool } from "./ReadFileTool";
export {
    ShellCommandInputSchema,
    ShellCommandOutputSchema,
    ShellCommandTool,
} from "./ShellCommandTool";
export {
    WalkDirectoryInputSchema,
    WalkDirectoryOutputSchema,
    WalkDirectoryTool,
} from "./WalkDirectoryTool";
export {
    WriteFileInputSchema,
    WriteFileOutputSchema,
    WriteFileTool,
} from "./WriteFileTool";

export type WorkspaceTools = [
    ReadFileTool,
    WriteFileTool,
    ShellCommandTool,
    WalkDirectoryTool,
];
