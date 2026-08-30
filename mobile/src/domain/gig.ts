export interface GigSummary {
  date: string;
  description: string | null;
  fee: number | null;
  genre: string;
  hostId: string;
  hostName: string;
  id: string;
  isLocked: boolean;
  place: string;
  title: string;
  wantedInstruments: string[];
}

export interface CreateGigInput {
  date: string;
  description: string;
  fee?: number | null;
  genre: string;
  hostId: string;
  place: string;
  title: string;
  wantedInstruments: string[];
}

export function createGigPayload(input: CreateGigInput) {
  const title = input.title.trim();
  const description = input.description.trim();
  const place = input.place.trim();
  if (!title || !description || !place || !input.genre || input.wantedInstruments.length === 0) {
    throw new Error('gig_required_fields_missing');
  }
  if (Number.isNaN(Date.parse(input.date))) throw new Error('gig_date_invalid');
  return {
    date: new Date(input.date).toISOString(),
    description,
    fee: input.fee ?? null,
    genre: input.genre,
    host_id: input.hostId,
    neighborhood: place,
    place,
    public_location_label: place,
    title,
    wanted_instruments: [...new Set(input.wantedInstruments)],
  };
}

export function gigApplicationPayload(
  gigId: string,
  musicianId: string,
  instrument: string,
  message: string,
) {
  if (!gigId || !musicianId || !instrument.trim()) throw new Error('gig_application_invalid');
  return {
    gig_id: gigId,
    instrument: instrument.trim(),
    message: message.trim(),
    musician_id: musicianId,
  };
}
