import type { RAGDocumentEntity } from '../data/RAGDocumentEntity.entity';

export type RAGDocumentProps = {
	id: string;
	sourceReference: string | null;
	title: string | null;
	contentHash: string | null;
	deduplicationKey: string | null;
	documentMetadata: Record<string, unknown>;
	createdAt: Date;
	updatedAt: Date;
};

export class RAGDocument {
	public readonly id: string;
	public readonly sourceReference: string | null;
	public readonly title: string | null;
	public readonly contentHash: string | null;
	public readonly deduplicationKey: string | null;
	public readonly documentMetadata: Record<string, unknown>;
	public readonly createdAt: Date;
	public readonly updatedAt: Date;

	public static fromEntity(entity: RAGDocumentEntity): RAGDocument {
		return new RAGDocument({
			id: entity.id,
			sourceReference: entity.sourceReference,
			title: entity.title,
			contentHash: entity.contentHash,
			deduplicationKey: entity.deduplicationKey,
			documentMetadata: entity.documentMetadata,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
		});
	}

	public static toEntity(document: RAGDocument): RAGDocumentEntity {
		return {
			id: document.id,
			sourceReference: document.sourceReference,
			title: document.title,
			contentHash: document.contentHash,
			deduplicationKey: document.deduplicationKey,
			documentMetadata: document.documentMetadata,
			createdAt: document.createdAt,
			updatedAt: document.updatedAt,
		} as RAGDocumentEntity;
	}

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
		this.deduplicationKey = props.deduplicationKey;
		this.documentMetadata = { ...props.documentMetadata };
		this.createdAt = new Date(props.createdAt);
		this.updatedAt = new Date(props.updatedAt);
	}
}
