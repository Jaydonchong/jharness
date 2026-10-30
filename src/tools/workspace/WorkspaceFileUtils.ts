import path from "node:path";
import { DomainError, ErrorCode } from "../../utils/ErrorCode";

export const MAX_FILE_SIZE_BYTES = 1024 * 1024;

export const resolveAbsolutePath = (requestedPath: string): string => {
    if (!path.isAbsolute(requestedPath)) {
        throw new DomainError(
            ErrorCode.AI_TOOL_CALL_ERROR,
            "File path must be absolute",
        );
    }

    return path.normalize(requestedPath);
};
