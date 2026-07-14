export const CLASS_CODES = [
	'PUMP-CENTRIFUGAL',
	'PUMP-POSITIVE-DISPLACEMENT',
	'PUMP-SUBMERSIBLE',
	'MOTOR-ELECTRIC',
	'PIG-TRAP',
	'METER-CORIOLIS',
	'SITE',
	'AREA',
	'SYSTEM',
	'LENDER-CONTEXT',
	'OTHER'
] as const;
export type ClassCode = (typeof CLASS_CODES)[number];

export const LIFECYCLE_STATES = [
	'planned',
	'operating',
	'standby',
	'shutdown',
	'decommissioned'
] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export function isPumpClass(code: string | null | undefined): boolean {
	return !!code && code.startsWith('PUMP-');
}

export const CONDITION_RATINGS = ['A', 'B', 'C', 'D'] as const;
export type ConditionRating = (typeof CONDITION_RATINGS)[number];

export const CONDITION_LABELS: Record<ConditionRating, string> = {
	A: 'A — Excellent',
	B: 'B — Good',
	C: 'C — Needs attention',
	D: 'D — Critical'
};

export const CONDITION_COLORS: Record<ConditionRating, string> = {
	A: '#2d8a5f',
	B: '#a3c266',
	C: '#e0a936',
	D: '#c04a3d'
};

export const CONDITION_COLOR_UNASSESSED = '#9ca3af';

export const ASSESSMENT_STATUSES = ['assessed', 'pending', 'not_in_scope'] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const FINDING_SEVERITIES = ['critical', 'major', 'minor', 'observation'] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const RECOMMENDATION_PRIORITIES = ['urgent', 'planned', 'monitor'] as const;
export type RecommendationPriority = (typeof RECOMMENDATION_PRIORITIES)[number];
