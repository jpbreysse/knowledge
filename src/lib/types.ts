export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export const STATUSES = ['raised', 'reviewed', 'accepted', 'mitigated', 'closed'] as const;
export const FINDING_TYPES = ['inspection'] as const;

export type Severity = (typeof SEVERITIES)[number];
export type Status = (typeof STATUSES)[number];
// Domain vocabularies introduce arbitrary type ids beyond the legacy const.
export type FindingType = string;

export interface Finding {
	id: string;
	finding_type: FindingType;
	title: string;
	severity: Severity;
	status: Status;
	description_doc_id: string | null;
	description_html: string | null;
	description_synced_at: string | Date | null;
	attributes: Record<string, unknown>;
	raised_at: string | Date;
	raised_by: string | null;
	reviewed_at: string | Date | null;
	reviewed_by: string | null;
	closed_at: string | Date | null;
	closed_by: string | null;
	created_at: string | Date;
	updated_at: string | Date;
	updated_by: string | null;
}

export interface FindingRow extends Finding {
	asset_count: number;
	document_count: number;
}

export interface AssetLink {
	finding_id: string;
	asset_id: string;
	asset_tag: string | null;
	asset_display: string | null;
	linked_at: string | Date;
}

export interface DocumentLink {
	finding_id: string;
	document_id: string;
	document_title: string | null;
	linked_at: string | Date;
}

