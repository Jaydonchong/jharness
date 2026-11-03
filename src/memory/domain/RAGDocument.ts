export type RAGDocumentProps = {
	id: string;
	sourceReference: string | null;
	title: string | null;
	contentHash: string | null;
	documentMetadata: Record<string, unknown>;
	createdAt: Date;
	updatedAt: Date;
};

export class RAGDocument {
	public readonly id: string;
	public readonly sourceReference: string | null;
	public readonly title: string | null;
	public readonly contentHash: string | null;
	public readonly documentMetadata: Record<string, unknown>;
	public readonly createdAt: Date;
	public readonly updatedAt: Date;

	public constructor(props: RAGDocumentProps) {
		if (!props.id.trim()) {
			throw new TypeError('RAGDocument id must not be empty.');
		}

		if (
			Number.isNaN(props.createdAt.getTime()) ||
			Number.isNaN(props.updatedAt.getTime()) ||
			props.updatedAt < props.createdAt
		) {
			throw new RangeError('RAGDocument timestamps must be valid and ordered.');
		}

		this.id = props.id;
		this.sourceReference = props.sourceReference;
		this.title = props.title;
		this.contentHash = props.contentHash;
		this.documentMetadata = { ...props.documentMetadata };
		this.createdAt = new Date(props.createdAt);
		this.updatedAt = new Date(props.updatedAt);
	}
}
