import {
  createGigPayload,
  gigApplicationPayload,
  type CreateGigInput,
  type GigSummary,
} from '@/domain/gig';
import { pageRange, type Page } from '@/domain/pagination';
import { getSupabaseClient } from '@/services/supabase/client';
import type { Database } from '@/services/supabase/database.types';

type GigFeedRow = Database['public']['Views']['gig_requests_feed']['Row'];
type GigProjection = Pick<
  GigFeedRow,
  | 'date'
  | 'description'
  | 'fee'
  | 'genre'
  | 'host_id'
  | 'id'
  | 'is_locked'
  | 'place'
  | 'public_location_label'
  | 'title'
  | 'wanted_instruments'
>;

function validGig(row: GigProjection): row is GigProjection & {
  date: string;
  genre: string;
  host_id: string;
  id: string;
  title: string;
} {
  return Boolean(row.date && row.genre && row.host_id && row.id && row.title);
}

async function mapGigs(rows: GigProjection[], signal?: AbortSignal): Promise<GigSummary[]> {
  const validRows = rows.filter(validGig);
  const hostIds = [...new Set(validRows.map((row) => row.host_id))];
  const names = new Map<string, string>();
  if (hostIds.length > 0) {
    const query = getSupabaseClient().from('profiles').select('id,name').in('id', hostIds);
    const result = await (signal ? query.abortSignal(signal) : query);
    if (result.error) throw result.error;
    for (const profile of result.data) names.set(profile.id, profile.name);
  }
  return validRows.map((row) => ({
    date: row.date,
    description: row.description,
    fee: row.fee,
    genre: row.genre,
    hostId: row.host_id,
    hostName: names.get(row.host_id) ?? 'Organisateur',
    id: row.id,
    isLocked: row.is_locked === true,
    place: row.public_location_label || row.place || '',
    title: row.title,
    wantedInstruments: row.wanted_instruments ?? [],
  }));
}

const gigColumns =
  'id,host_id,title,date,genre,place,public_location_label,wanted_instruments,fee,description,is_locked' as const;

export async function fetchGigsPage(
  page: number,
  pageSize = 20,
  signal?: AbortSignal,
): Promise<Page<GigSummary>> {
  const { from, to } = pageRange(page, pageSize);
  const query = getSupabaseClient()
    .from('gig_requests_feed')
    .select(gigColumns)
    .gte('date', new Date().toISOString())
    .order('date')
    .order('id')
    .range(from, to + 1);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  const rows = result.data.slice(0, pageSize) as GigProjection[];
  return {
    items: await mapGigs(rows, signal),
    nextPage: result.data.length > pageSize ? page + 1 : null,
  };
}

export async function fetchGig(gigId: string, signal?: AbortSignal): Promise<GigSummary> {
  const query = getSupabaseClient().from('gig_requests_feed').select(gigColumns).eq('id', gigId);
  const result = await (signal ? query.abortSignal(signal) : query).single();
  if (result.error) throw result.error;
  const [gig] = await mapGigs([result.data as GigProjection], signal);
  if (!gig) throw new Error('gig_not_found');
  return gig;
}

export async function createGig(input: CreateGigInput): Promise<string> {
  const result = await getSupabaseClient()
    .from('gig_requests')
    .insert(createGigPayload(input))
    .select('id')
    .single();
  if (result.error) throw result.error;
  return result.data.id;
}

export async function applyToGig(
  gigId: string,
  musicianId: string,
  instrument: string,
  message: string,
): Promise<void> {
  const result = await getSupabaseClient()
    .from('gig_applications')
    .insert(gigApplicationPayload(gigId, musicianId, instrument, message));
  if (result.error) throw result.error;
}
