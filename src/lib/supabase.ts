import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Falta configurar la URL o la clave pública de Supabase en .env.local.'
  )
}

// Sesión habitual de CITA.
export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
)

// Sesión independiente para validar una invitación.
// No lee ni guarda la sesión del administrador.
export function crearClienteInvitacion() {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'cita-invitacion',
    },
  })
}