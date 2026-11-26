import type { YandexDurationType, YandexServiceType } from '../types';

export const YANDEX_SERVICES: Array<{
  id: YandexServiceType;
  labelKey: string;
  descKey: string;
  iconName: 'baby' | 'home' | 'building' | 'heart' | 'users' | 'sparkles';
}> = [
  { id: 'childcare', labelKey: 'services.childcare', descKey: 'services.childcare_desc', iconName: 'baby' },
  { id: 'house_cleaning', labelKey: 'services.house_cleaning', descKey: 'services.house_cleaning_desc', iconName: 'home' },
  { id: 'hotel_cleaning', labelKey: 'services.hotel_cleaning', descKey: 'services.hotel_cleaning_desc', iconName: 'building' },
  { id: 'postpartum_care', labelKey: 'services.postpartum_care', descKey: 'services.postpartum_care_desc', iconName: 'heart' },
  { id: 'elder_care', labelKey: 'services.elder_care', descKey: 'services.elder_care_desc', iconName: 'users' },
  { id: 'other', labelKey: 'services.other', descKey: 'services.other_desc', iconName: 'sparkles' },
];

export const YANDEX_DURATIONS: Array<{
  id: YandexDurationType;
  labelKey: string;
  hoursHint: string;
}> = [
  { id: 'hourly', labelKey: 'durations.hourly', hoursHint: '1-3 soat' },
  { id: 'half_day', labelKey: 'durations.half_day', hoursHint: '4 soat' },
  { id: 'full_day', labelKey: 'durations.full_day', hoursHint: '8 soat' },
];

export const SAMARKAND_DEFAULT_COORDS: [number, number] = [39.6542, 66.9597];

export const SAMARKAND_DISTRICTS: Array<{ name: string; lat: number; lng: number }> = [
  { name: 'Samarqand shahar', lat: 39.6542, lng: 66.9597 },
  { name: 'Urgut', lat: 39.4022, lng: 67.2431 },
  { name: 'Toyloq', lat: 39.5878, lng: 67.0856 },
  { name: 'Jomboy', lat: 39.7003, lng: 67.0933 },
  { name: 'Pastdarg‘om', lat: 39.7133, lng: 66.7439 },
  { name: 'Bulung‘ur', lat: 39.7647, lng: 67.2714 },
  { name: 'Kattaqo‘rg‘on', lat: 39.8989, lng: 66.2561 },
  { name: 'Payariq', lat: 39.9881, lng: 66.8489 },
  { name: 'Ishtixon', lat: 39.9658, lng: 66.4883 },
  { name: 'Narpay', lat: 39.8972, lng: 65.9875 },
  { name: 'Qo‘shrabot', lat: 40.3547, lng: 66.6433 },
];

export function formatSom(amount: number | undefined | null): string {
  const n = Math.round(Number(amount || 0));
  return `${n.toLocaleString('uz-UZ')} so‘m`;
}
