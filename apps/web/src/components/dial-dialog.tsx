'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import { PhoneCall } from 'lucide-react';
import type { CallDto, ContactDto, PersonalityDto } from '@onepct/shared';
import { api, fetcher } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export function DialDialog({ trigger }: { trigger?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [contactId, setContactId] = useState<string>('');
  const [personalityId, setPersonalityId] = useState<string>('');
  const [goal, setGoal] = useState('');
  const [dialing, setDialing] = useState(false);

  const { data: contacts } = useSWR<{ items: ContactDto[] }>(
    open ? '/contacts?limit=100' : null,
    fetcher,
  );
  const { data: personalities } = useSWR<{ items: PersonalityDto[] }>(
    open ? '/personalities' : null,
    fetcher,
  );

  async function dial() {
    const contact = contacts?.items.find((c) => c.id === contactId);
    const to = phone.trim() || contact?.phoneE164 || '';
    if (!to) {
      toast.error('Enter a number or pick a contact');
      return;
    }
    setDialing(true);
    try {
      const { call } = await api.post<{ call: CallDto }>('/calls', {
        to,
        ...(contactId ? { contactId } : {}),
        ...(personalityId ? { personalityId } : {}),
        ...(goal.trim() ? { goal: goal.trim() } : {}),
      });
      toast.success(`Dialing ${call.contactName ?? call.toNumber}…`);
      setOpen(false);
      router.push(`/calls/live/${call.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDialing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <PhoneCall /> New call
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Place a call</DialogTitle>
          <DialogDescription>
            Your digital human dials, talks, remembers, and reports back.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dial-phone">Phone number</Label>
              <Input
                id="dial-phone"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="font-mono-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label>or contact</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a contact" />
                </SelectTrigger>
                <SelectContent>
                  {(contacts?.items ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Personality</Label>
            <Select value={personalityId} onValueChange={setPersonalityId}>
              <SelectTrigger>
                <SelectValue placeholder="Default personality" />
              </SelectTrigger>
              <SelectContent>
                {(personalities?.items ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dial-goal">Goal of this call</Label>
            <Textarea
              id="dial-goal"
              placeholder="e.g. Wish Ravi a happy birthday and ask about the wedding plans"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={3}
            />
          </div>
          <Button className="w-full" size="lg" onClick={dial} disabled={dialing}>
            <PhoneCall />
            {dialing ? 'Dialing…' : 'Call now'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
