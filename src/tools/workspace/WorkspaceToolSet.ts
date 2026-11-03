import type { ReadFileTool } from './ReadFileTool';
import type { ShellCommandTool } from './ShellCommandTool';
import type { WalkDirectoryTool } from './WalkDirectoryTool';
import type { WriteFileTool } from './WriteFileTool';

export type WorkspaceToolSet = [ReadFileTool, WriteFileTool, ShellCommandTool, WalkDirectoryTool];
