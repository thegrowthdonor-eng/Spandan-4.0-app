export type PublicCompetition = {
  eventId:string; title:string; serverTime:string;
  settings:{ schedule_mode:string;result_mode:string;submission_closes_at:string|null;verified:boolean }|null;
  entries:Array<{id:string;entry_number:number;title:string;description:string;image_url:string|null;thumbnail_url?:string|null}>;
  rounds:Array<{id:string;round:number;opens_at:string;closes_at:string;options:Array<{id:string;entry_id:string;votes:number|null}>}>;
  sessions:Array<{id:string;title:string;venue:string;starts_at:string;reporting_at:string|null;ends_at:string|null;state:string;current_position:number|null;entrants:Array<{label:string;position:number;status:string|null;attempts:Array<number|null>;placing:number|null}>}>;
};

export async function competitionRpc<T>(name:"public_competition"|"cast_competition_vote", body:unknown):Promise<T> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${name}`, { method:"POST", credentials:"omit", headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,"Content-Type":"application/json"},body:JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message ?? "Competition service unavailable.");
  return result;
}
const cache = new Map<string,{data:PublicCompetition|null;at:number;pending?:Promise<PublicCompetition|null>}>();
export function readCompetition(eventId:string, force=false):Promise<PublicCompetition|null> {
  const saved = cache.get(eventId);
  if (saved?.pending) return saved.pending;
  if (!force && saved && Date.now()-saved.at<60_000) return Promise.resolve(saved.data);
  const pending = competitionRpc<PublicCompetition|null>("public_competition",{p_event_id:eventId}).then(data => { cache.set(eventId,{data,at:Date.now()}); return data; }).catch(error => { if (saved) cache.set(eventId,{...saved,pending:undefined}); else cache.delete(eventId); throw error; });
  cache.set(eventId,{data:saved?.data ?? null,at:saved?.at ?? 0,pending});
  return pending;
}

const grants = new Map<string,{token:string;expiresAt:string}>();
export async function voteCompetition(pollId:string, optionId:string) {
  let grant = grants.get(pollId);
  if (!grant || Date.parse(grant.expiresAt)<=Date.now()+5_000) {
    const response = await fetch("/api/competition/voting",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pollId})});
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Sign in again to vote.");
    if (body.optionId) return { optionId:body.optionId as string };
    grant = {token:body.token,expiresAt:body.expiresAt}; grants.set(pollId,grant);
  }
  try { return await competitionRpc<{optionId:string;receiptId:string}>("cast_competition_vote",{p_token:grant.token,p_option_id:optionId}); }
  catch (error) { grants.delete(pollId); throw error; }
}
