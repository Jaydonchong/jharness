export class BaselineTokenizer {
	public tokenize(text: string): string[] {
		return text.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}\s]/gu) ?? [];
	}
}
