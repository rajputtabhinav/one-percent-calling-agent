import type { TelephonyProviderName } from '@onepct/shared';
import { badRequest } from '../lib/errors';
import { exotelProvider } from './exotel';
import { sipProvider } from './sip';
import { twilioProvider } from './twilio';
import type { TelephonyProvider } from './types';

const providers: Record<TelephonyProviderName, TelephonyProvider> = {
  twilio: twilioProvider,
  exotel: exotelProvider,
  sip: sipProvider,
};

export function getTelephonyProvider(name: TelephonyProviderName): TelephonyProvider {
  const provider = providers[name];
  if (!provider) throw badRequest(`Unknown telephony provider: ${name}`);
  return provider;
}
