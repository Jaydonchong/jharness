export interface IConversationalAgent {
    sendMessages(
        messages: ModelConversationMessage[],
    ): Promise<ModelConversationMessage[]>;
}

export type ModelConversationMessage = {
    role: string;
    content: string | Record<string, unknown>[];
};

// From Vercel's API DOC
// https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text#types
