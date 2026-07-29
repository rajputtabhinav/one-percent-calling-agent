import type { ContactDto, RelationshipEventDto } from '@onepct/shared';
import { query, queryOne } from '../../db/pool';

export interface ContactRow {
  id: string;
  name: string;
  phone_e164: string;
  relationship_label: string | null;
  notes: string | null;
  familiarity_score: number;
  trust_score: number;
  interaction_count: number;
  first_interaction_at: Date | null;
  last_interaction_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

export function toContactDto(r: ContactRow): ContactDto {
  return {
    id: r.id,
    name: r.name,
    phoneE164: r.phone_e164,
    relationshipLabel: r.relationship_label,
    notes: r.notes,
    familiarityScore: Math.round(r.familiarity_score * 10) / 10,
    trustScore: Math.round(r.trust_score * 10) / 10,
    interactionCount: r.interaction_count,
    firstInteractionAt: iso(r.first_interaction_at),
    lastInteractionAt: iso(r.last_interaction_at),
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
  };
}

export async function listContacts(opts: {
  q?: string;
  sort?: 'recent' | 'familiarity' | 'name';
  limit: number;
  offset: number;
}): Promise<{ rows: ContactRow[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.q) {
    params.push(`%${opts.q}%`);
    where.push(`(name ILIKE $${params.length} OR phone_e164 ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql =
    opts.sort === 'familiarity'
      ? 'ORDER BY familiarity_score DESC'
      : opts.sort === 'name'
        ? 'ORDER BY name ASC'
        : 'ORDER BY last_interaction_at DESC NULLS LAST, created_at DESC';
  const totalRow = await queryOne<{ count: number }>(
    `SELECT count(*)::int AS count FROM contacts ${whereSql}`,
    params,
  );
  params.push(opts.limit, opts.offset);
  const rows = await query<ContactRow>(
    `SELECT * FROM contacts ${whereSql} ${orderSql} LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows, total: totalRow?.count ?? 0 };
}

export async function getContact(id: string): Promise<ContactRow | null> {
  return queryOne<ContactRow>('SELECT * FROM contacts WHERE id = $1', [id]);
}

export async function getContactByPhone(phoneE164: string): Promise<ContactRow | null> {
  return queryOne<ContactRow>('SELECT * FROM contacts WHERE phone_e164 = $1', [phoneE164]);
}

export async function createContact(input: {
  name: string;
  phoneE164: string;
  relationshipLabel?: string | null;
  notes?: string | null;
}): Promise<ContactRow> {
  const rows = await query<ContactRow>(
    `INSERT INTO contacts (name, phone_e164, relationship_label, notes)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [input.name, input.phoneE164, input.relationshipLabel ?? null, input.notes ?? null],
  );
  return rows[0];
}

export async function findOrCreateByPhone(phoneE164: string): Promise<ContactRow> {
  const existing = await getContactByPhone(phoneE164);
  if (existing) return existing;
  return createContact({ name: phoneE164, phoneE164 });
}

export async function updateContact(
  id: string,
  patch: Partial<{
    name: string;
    phoneE164: string;
    relationshipLabel: string | null;
    notes: string | null;
  }>,
): Promise<ContactRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, val: unknown) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };
  if (patch.name !== undefined) add('name', patch.name);
  if (patch.phoneE164 !== undefined) add('phone_e164', patch.phoneE164);
  if (patch.relationshipLabel !== undefined) add('relationship_label', patch.relationshipLabel);
  if (patch.notes !== undefined) add('notes', patch.notes);
  if (!sets.length) return getContact(id);
  params.push(id);
  const rows = await query<ContactRow>(
    `UPDATE contacts SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return rows[0] ?? null;
}

export async function deleteContact(id: string): Promise<boolean> {
  const rows = await query('DELETE FROM contacts WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}

// ── Relationship timeline ────────────────────────────────────────────────────

export async function getTimeline(contactId: string, limit = 50): Promise<RelationshipEventDto[]> {
  const rows = await query<any>(
    `SELECT * FROM relationship_events WHERE contact_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [contactId, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    contactId: r.contact_id,
    callId: r.call_id,
    kind: r.kind,
    description: r.description,
    deltaFamiliarity: r.delta_familiarity,
    deltaTrust: r.delta_trust,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function addRelationshipEvent(input: {
  contactId: string;
  callId?: string | null;
  kind: string;
  description: string;
  deltaFamiliarity?: number;
  deltaTrust?: number;
}): Promise<void> {
  await query(
    `INSERT INTO relationship_events (contact_id, call_id, kind, description, delta_familiarity, delta_trust)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      input.contactId,
      input.callId ?? null,
      input.kind,
      input.description,
      input.deltaFamiliarity ?? 0,
      input.deltaTrust ?? 0,
    ],
  );
}

export async function applyScoreDeltas(
  contactId: string,
  deltaFamiliarity: number,
  deltaTrust: number,
  interactionAt: Date,
): Promise<void> {
  await query(
    `UPDATE contacts SET
       familiarity_score = greatest(0, least(100, familiarity_score + $2)),
       trust_score = greatest(0, least(100, trust_score + $3)),
       interaction_count = interaction_count + 1,
       first_interaction_at = coalesce(first_interaction_at, $4),
       last_interaction_at = $4,
       updated_at = now()
     WHERE id = $1`,
    [contactId, deltaFamiliarity, deltaTrust, interactionAt],
  );
}
