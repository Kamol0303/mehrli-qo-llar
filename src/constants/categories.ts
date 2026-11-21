/** The 5 core specialties / service directions across the entire platform. */
export const SERVICE_DIRECTIONS = [
  {
    id: 'childcare',
    name: 'Yosh bolalarga enagalik',
    icon: '👶',
    aliases: ['nanny', 'babysitting'],
    keywords: ['enaga', 'нян', 'nanny', 'bolalarga', 'yosh bola'],
  },
  {
    id: 'house_cleaning',
    name: 'Uy tozalash',
    icon: '🧹',
    aliases: ['cleaner'],
    keywords: ['uy tozalash', 'uy-joy', 'house clean', 'уборка дома', 'уборка квартир'],
  },
  {
    id: 'hotel_cleaning',
    name: 'Mehmonxona tozalash',
    icon: '🏨',
    aliases: ['hospitality'],
    keywords: ['mehmonxona', 'hotel', 'гостиниц'],
  },
  {
    id: 'elder_care',
    name: 'Keksalarga qarash',
    icon: '🤝',
    aliases: ['caregiver'],
    keywords: ['keksa', 'qariya', 'пожил', 'elder'],
  },
  {
    id: 'postpartum_care',
    name: "Tug'ruqdan keyingi parvarish",
    icon: '🤱',
    aliases: ['midwifery'],
    keywords: ['tugʻruq', 'tugruq', "tug'ruq", 'keyingi parvarish', 'postpartum', 'послеродов'],
  },
] as const;

export type ServiceDirectionId = (typeof SERVICE_DIRECTIONS)[number]['id'];

export function isServiceDirection(value?: string | null): value is ServiceDirectionId {
  return SERVICE_DIRECTIONS.some((direction) => direction.id === value);
}

/** A job matches a direction by its saved category or by the words in the title. */
export function jobMatchesDirection(
  job: { category?: string | null; title?: string | null; description?: string | null },
  directionId: string,
): boolean {
  const direction = SERVICE_DIRECTIONS.find((item) => item.id === directionId);
  if (!direction) return true;
  const category = (job.category || '').trim();
  if (
    category === direction.id ||
    category.toLowerCase() === direction.name.toLowerCase() ||
    (direction.aliases as readonly string[]).includes(category)
  ) {
    return true;
  }
  const titled = `${job.title || ''} ${job.description || ''}`.toLowerCase();
  if (titled.includes(direction.name.toLowerCase())) return true;
  return direction.keywords.some((word) => titled.includes(word));
}

/** A worker matches a direction by profession, skills, or the words in the bio. */
export function workerMatchesDirection(
  worker: {
    profession?: string | null;
    skills?: readonly string[] | null;
    bio?: string | null;
    professionalSummary?: string | null;
  },
  directionId: string,
): boolean {
  const direction = SERVICE_DIRECTIONS.find((item) => item.id === directionId);
  if (!direction) return true;
  const ids = new Set<string>([direction.id, direction.name.toLowerCase(), ...direction.aliases]);
  const fields = [worker.profession, ...(worker.skills ?? [])].filter(
    (value): value is string => Boolean(value),
  );
  if (fields.some((field) => ids.has(field) || ids.has(field.toLowerCase()))) return true;
  const text = `${worker.bio || ''} ${worker.professionalSummary || ''} ${fields.join(' ')}`.toLowerCase();
  if (text.includes(direction.name.toLowerCase())) return true;
  if (direction.keywords.some((word) => text.includes(word))) return true;
  return direction.aliases.some((alias) => text.includes(alias));
}

export const CATEGORIES = SERVICE_DIRECTIONS.map(({ id, name, icon }) => ({ id, name, icon }));

export const EDUCATION_LEVELS = [
  { id: 'none', name: "Ma'lumoti yo'q" },
  { id: 'secondary', name: "O'rta ta'lim" },
  { id: 'vocational', name: "O'rta maxsus (kollej/litsey)" },
  { id: 'other', name: 'Boshqa' },
];

export const SKILLS = SERVICE_DIRECTIONS.map(({ id, name }) => ({ id, name }));
