/** Worker core development / risk indicators */
export type IndicatorLevel = '' | 'low' | 'medium' | 'high' | 'critical' | 'none' | 'unknown';

export interface WorkerCoreIndicators {
  familyIncome?: string;
  motherSocialStatus?: string;
  educationResults?: string;
  attendance?: string;
  healthStatus?: string;
  psychologicalState?: string;
  disabilityStatus?: string;
  earlyMarriageRisk?: IndicatorLevel | string;
  violenceRisk?: IndicatorLevel | string;
  digitalLiteracy?: string;
  /** Summary risk index / assessment */
  riskAssessment?: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByRole?: string;
}

export const CORE_INDICATOR_FIELDS: Array<{
  key: keyof WorkerCoreIndicators;
  labelKey: string;
  kind: 'text' | 'select_risk' | 'textarea';
}> = [
  { key: 'familyIncome', labelKey: 'core_indicators.field_familyIncome', kind: 'text' },
  { key: 'motherSocialStatus', labelKey: 'core_indicators.field_motherSocialStatus', kind: 'text' },
  { key: 'educationResults', labelKey: 'core_indicators.field_educationResults', kind: 'text' },
  { key: 'attendance', labelKey: 'core_indicators.field_attendance', kind: 'text' },
  { key: 'healthStatus', labelKey: 'core_indicators.field_healthStatus', kind: 'text' },
  { key: 'psychologicalState', labelKey: 'core_indicators.field_psychologicalState', kind: 'text' },
  { key: 'disabilityStatus', labelKey: 'core_indicators.field_disabilityStatus', kind: 'text' },
  { key: 'earlyMarriageRisk', labelKey: 'core_indicators.field_earlyMarriageRisk', kind: 'select_risk' },
  { key: 'violenceRisk', labelKey: 'core_indicators.field_violenceRisk', kind: 'select_risk' },
  { key: 'digitalLiteracy', labelKey: 'core_indicators.field_digitalLiteracy', kind: 'text' },
];

export const RISK_LEVEL_OPTIONS: { value: IndicatorLevel; labelKey: string; tone: string }[] = [
  { value: 'none', labelKey: 'core_indicators.risk_none', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'low', labelKey: 'core_indicators.risk_low', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'medium', labelKey: 'core_indicators.risk_medium', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  { value: 'high', labelKey: 'core_indicators.risk_high', tone: 'bg-orange-50 text-orange-800 border-orange-200' },
  { value: 'critical', labelKey: 'core_indicators.risk_critical', tone: 'bg-rose-50 text-rose-700 border-rose-200' },
  { value: 'unknown', labelKey: 'core_indicators.risk_unknown', tone: 'bg-slate-50 text-slate-600 border-slate-200' },
];

export function riskTone(value?: string): string {
  const found = RISK_LEVEL_OPTIONS.find((o) => o.value === value);
  return found?.tone || 'bg-slate-50 text-slate-700 border-slate-200';
}

export function riskLabelKey(value?: string): string | null {
  if (!value) return null;
  const found = RISK_LEVEL_OPTIONS.find((o) => o.value === value);
  return found?.labelKey || null;
}
