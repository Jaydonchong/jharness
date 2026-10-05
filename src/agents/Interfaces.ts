export interface IConversationalAgent {
    sendMessages(messages: ModelConversationMessage[]): Promise<string>;
}
export type ModelConversationMessage = { role: string; content: string };