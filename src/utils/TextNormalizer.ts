export class TextNormalizer {
	public static normalize(text: string): string {
		return TextNormalizer.trimOuterWhitespace(
			TextNormalizer.normalizeUnicode(TextNormalizer.normalizeLineEndings(text)),
		);
	}

	public static normalizeLineEndings(text: string): string {
		return text.replace(/\r\n?/g, '\n');
	}

	public static normalizeUnicode(text: string): string {
		return text.normalize('NFC');
	}

	public static trimOuterWhitespace(text: string): string {
		return text.trim();
	}
}
