import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateContactSchema, UpdateContactSchema } from '@onepct/shared';
import { notFound } from '../../lib/errors';
import { normalizePhone } from '../../lib/phone';
import { getSettings } from '../settings/service';
import {
  createContact,
  deleteContact,
  getContact,
  getContactByPhone,
  getTimeline,
  listContacts,
  toContactDto,
  updateContact,
} from './repo';

const ListQuery = z.object({
  q: z.string().max(120).optional(),
  sort: z.enum(['recent', 'familiarity', 'name']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function contactsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (req) => {
    const q = ListQuery.parse(req.query);
    const { rows, total } = await listContacts(q);
    return { items: rows.map(toContactDto), total, limit: q.limit, offset: q.offset };
  });

  app.post('/', async (req, reply) => {
    const body = CreateContactSchema.parse(req.body);
    const settings = await getSettings();
    const phoneE164 = normalizePhone(body.phone, settings.telephony.defaultCountryCode);
    const existing = await getContactByPhone(phoneE164);
    if (existing) {
      reply.code(200);
      return { contact: toContactDto(existing), existed: true };
    }
    const row = await createContact({
      name: body.name,
      phoneE164,
      relationshipLabel: body.relationshipLabel ?? null,
      notes: body.notes ?? null,
    });
    reply.code(201);
    return { contact: toContactDto(row), existed: false };
  });

  app.get('/:id', async (req) => {
    const { id } = req.params as { id: string };
    const row = await getContact(id);
    if (!row) throw notFound('Contact');
    return { contact: toContactDto(row) };
  });

  app.patch('/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = UpdateContactSchema.parse(req.body);
    const settings = await getSettings();
    const row = await updateContact(id, {
      name: body.name,
      phoneE164: body.phone
        ? normalizePhone(body.phone, settings.telephony.defaultCountryCode)
        : undefined,
      relationshipLabel: body.relationshipLabel,
      notes: body.notes,
    });
    if (!row) throw notFound('Contact');
    return { contact: toContactDto(row) };
  });

  app.delete('/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ok = await deleteContact(id);
    if (!ok) throw notFound('Contact');
    return { ok: true };
  });

  app.get('/:id/timeline', async (req) => {
    const { id } = req.params as { id: string };
    if (!(await getContact(id))) throw notFound('Contact');
    return { items: await getTimeline(id) };
  });
}
