import type { PersonalityDto, PersonalityStyle } from '@onepct/shared';
import { query, queryOne } from '../../db/pool';
import { getSettings } from '../settings/service';

export interface PersonalityRow {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  style: PersonalityStyle;
  voice: string;
  is_builtin: boolean;
  created_at: Date;
  updated_at: Date;
}

export function toPersonalityDto(r: PersonalityRow): PersonalityDto {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    systemPrompt: r.system_prompt,
    style: r.style,
    voice: r.voice,
    isBuiltin: r.is_builtin,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export async function listPersonalities(): Promise<PersonalityRow[]> {
  return query<PersonalityRow>(
    'SELECT * FROM personalities ORDER BY is_builtin DESC, created_at ASC',
  );
}

export async function getPersonality(id: string): Promise<PersonalityRow | null> {
  return queryOne<PersonalityRow>('SELECT * FROM personalities WHERE id = $1', [id]);
}

/** Default personality: Settings → personality.defaultId, else first builtin. */
export async function getDefaultPersonality(): Promise<PersonalityRow> {
  const settings = await getSettings();
  if (settings.personality.defaultId) {
    const row = await getPersonality(settings.personality.defaultId);
    if (row) return row;
  }
  const builtin = await queryOne<PersonalityRow>(
    `SELECT * FROM personalities WHERE is_builtin ORDER BY name = 'Friendly' DESC, created_at ASC LIMIT 1`,
  );
  if (builtin) return builtin;
  const any = await queryOne<PersonalityRow>(
    'SELECT * FROM personalities ORDER BY created_at ASC LIMIT 1',
  );
  if (!any) throw new Error('No personalities exist — seed migration missing');
  return any;
}

export async function createPersonality(input: {
  name: string;
  description: string;
  systemPrompt: string;
  style: PersonalityStyle;
  voice: string;
}): Promise<PersonalityRow> {
  const rows = await query<PersonalityRow>(
    `INSERT INTO personalities (name, description, system_prompt, style, voice)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [input.name, input.description, input.systemPrompt, JSON.stringify(input.style), input.voice],
  );
  return rows[0];
}

export async function updatePersonality(
  id: string,
  input: {
    name: string;
    description: string;
    systemPrompt: string;
    style: PersonalityStyle;
    voice: string;
  },
): Promise<PersonalityRow | null> {
  const rows = await query<PersonalityRow>(
    `UPDATE personalities
     SET name=$2, description=$3, system_prompt=$4, style=$5, voice=$6, updated_at=now()
     WHERE id=$1 RETURNING *`,
    [id, input.name, input.description, input.systemPrompt, JSON.stringify(input.style), input.voice],
  );
  return rows[0] ?? null;
}

export async function deletePersonality(id: string): Promise<'deleted' | 'builtin' | 'missing'> {
  const row = await getPersonality(id);
  if (!row) return 'missing';
  if (row.is_builtin) return 'builtin';
  await query('DELETE FROM personalities WHERE id = $1', [id]);
  return 'deleted';
}
