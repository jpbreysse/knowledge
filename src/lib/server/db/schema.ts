import { sql } from 'drizzle-orm';
import {
	pgTable,
	uuid,
	text,
	smallint,
	date,
	timestamp,
	jsonb,
	bigint,
	boolean,
	numeric,
	type AnyPgColumn
} from 'drizzle-orm/pg-core';

// NOTE: migrations are hand-written SQL (migrations/001_init.sql).
// This schema is a manual mirror for typed queries only.
// Do not run `drizzle-kit generate` or `drizzle-kit push` against this file.

// v3.1: The 7 equipment-flavoured columns (serial_no, manufacturer, model,
// location, criticality, lifecycle_state, commissioning_date) moved to
// `attributes` JSONB in migration 013 so each class declares which ones it uses.
export const asset = pgTable('asset', {
	id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
	tag: text('tag').notNull().unique(),
	name: text('name').notNull(),
	classCode: text('class_code').notNull(),
	attributes: jsonb('attributes').notNull().default(sql`'{}'::jsonb`).$type<Record<string, unknown>>(),
	content: jsonb('content').$type<Record<string, unknown> | null>(),
	contentHtml: text('content_html'),
	parentId: uuid('parent_id').references((): AnyPgColumn => asset.id, { onDelete: 'restrict' }),
	// v3.0 LCI additions — all nullable, additive.
	confidentiality: text('confidentiality'),
	version: text('version'),
	supersedesAssetId: uuid('supersedes_asset_id').references((): AnyPgColumn => asset.id, {
		onDelete: 'set null'
	}),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	updatedBy: text('updated_by')
});

export type AssetClassField = {
	name: string;
	label: string;
	type: 'text' | 'number' | 'date' | 'select' | 'boolean' | 'list' | 'object' | 'ref' | 'array_ref';
	required?: boolean;
	group?: string;
	unit?: string;
	options?: string[];
	/**
	 * For type='ref' or 'array_ref': scope the picker to assets of these class
	 * codes. Single string for one target class; array for many. Omit to allow
	 * any class.
	 */
	asset_class_filter?: string | string[];
};

export const assetClass = pgTable('asset_class', {
	id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
	code: text('code').notNull().unique(),
	label: text('label').notNull(),
	family: text('family').notNull(),
	description: text('description'),
	color: text('color'),
	attributeFields: jsonb('attribute_fields')
		.notNull()
		.default(sql`'[]'::jsonb`)
		.$type<AssetClassField[]>(),
	validLifecycleStates: jsonb('valid_lifecycle_states')
		.notNull()
		.default(sql`'[]'::jsonb`)
		.$type<string[]>(),
	applicableTabs: jsonb('applicable_tabs')
		.notNull()
		.default(sql`'[]'::jsonb`)
		.$type<string[]>(),
	enabled: boolean('enabled').notNull().default(true),
	// v3.0 LCI additions
	idPrefix: text('id_prefix'),
	confidentialityDefault: text('confidentiality_default'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const connector = pgTable('connector', {
	id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
	name: text('name').notNull().unique(),
	label: text('label').notNull(),
	baseUrl: text('base_url').notNull(),
	pathPrefix: text('path_prefix'),
	authType: text('auth_type').notNull().default('none'),
	enabled: boolean('enabled').notNull().default(true),
	// Template for the user-facing link to a single document.
	// Substitutions: {base_url}, {id}. Must contain {id}.
	linkTemplate: text('link_template').notNull().default('{base_url}/documents/{id}'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const assetDocument = pgTable('asset_document', {
	id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
	assetId: uuid('asset_id')
		.notNull()
		.references(() => asset.id, { onDelete: 'cascade' }),
	filename: text('filename').notNull(),
	// stored_path is null for linked docs; non-null for uploaded files.
	storedPath: text('stored_path'),
	mimeType: text('mime_type'),
	sizeBytes: bigint('size_bytes', { mode: 'number' }),
	description: text('description'),
	uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
	uploadedBy: text('uploaded_by'),
	// Set together for linked-from-connector docs.
	connectorId: uuid('connector_id').references(() => connector.id, { onDelete: 'restrict' }),
	externalUrl: text('external_url')
});

export const assetHistory = pgTable('asset_history', {
	id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
	assetId: uuid('asset_id')
		.notNull()
		.references(() => asset.id, { onDelete: 'cascade' }),
	changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
	changedBy: text('changed_by'),
	fieldName: text('field_name').notNull(),
	oldValue: text('old_value'),
	newValue: text('new_value')
});

export const assetAssessment = pgTable('asset_assessment', {
	id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
	assetId: uuid('asset_id')
		.notNull()
		.references(() => asset.id, { onDelete: 'cascade' }),
	conditionRating: text('condition_rating'),
	remainingUsefulLifeYears: numeric('remaining_useful_life_years', { precision: 5, scale: 1 }),
	riskScore: smallint('risk_score'),
	capexEstimateUsd: bigint('capex_estimate_usd', { mode: 'number' }),
	status: text('status').notNull().default('assessed'),
	assessedBy: text('assessed_by'),
	assessedOn: date('assessed_on'),
	summary: text('summary'),
	findings: jsonb('findings').notNull().default(sql`'[]'::jsonb`).$type<AssessmentFinding[]>(),
	recommendations: jsonb('recommendations')
		.notNull()
		.default(sql`'[]'::jsonb`)
		.$type<AssessmentRecommendation[]>(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export type AssessmentFinding = {
	severity: 'critical' | 'major' | 'minor' | 'observation';
	title: string;
	detail?: string;
};

export type AssessmentRecommendation = {
	action: string;
	priority: 'urgent' | 'planned' | 'monitor';
	capex_estimate_usd?: number;
	timing?: string;
};

export const entityLink = pgTable('entity_link', {
	id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
	sourceId: uuid('source_id')
		.notNull()
		.references(() => asset.id, { onDelete: 'cascade' }),
	targetId: uuid('target_id')
		.notNull()
		.references(() => asset.id, { onDelete: 'cascade' }),
	relationType: text('relation_type').notNull(),
	attributes: jsonb('attributes').notNull().default(sql`'{}'::jsonb`).$type<Record<string, unknown>>(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	createdBy: text('created_by')
});

export type Asset = typeof asset.$inferSelect;
export type NewAsset = typeof asset.$inferInsert;
export type AssetDocument = typeof assetDocument.$inferSelect;
export type AssetHistory = typeof assetHistory.$inferSelect;
export type AssetAssessment = typeof assetAssessment.$inferSelect;
export type Connector = typeof connector.$inferSelect;
export type NewConnector = typeof connector.$inferInsert;
export type AssetClass = typeof assetClass.$inferSelect;
export type NewAssetClass = typeof assetClass.$inferInsert;
export type EntityLink = typeof entityLink.$inferSelect;
export type NewEntityLink = typeof entityLink.$inferInsert;

export { CLASS_CODES, LIFECYCLE_STATES, isPumpClass } from '$lib/constants';
export type { ClassCode, LifecycleState } from '$lib/constants';
