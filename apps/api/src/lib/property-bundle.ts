import type { SupabaseClient } from '@supabase/supabase-js'
import { throwIfDbError } from './db-result.js'

export async function loadPropertyStructure(db: SupabaseClient, propertyId: string) {
  const [floors, rooms, assets] = await Promise.all([
    db.from('floors').select('*').eq('property_id', propertyId).order('sort_order'),
    db.from('rooms').select('*').eq('property_id', propertyId).order('sort_order'),
    db.from('assets').select('*').eq('property_id', propertyId).order('sort_order'),
  ])
  throwIfDbError(floors.error)
  throwIfDbError(rooms.error)
  throwIfDbError(assets.error)
  return {
    floors: floors.data ?? [],
    rooms: rooms.data ?? [],
    assets: assets.data ?? [],
  }
}
