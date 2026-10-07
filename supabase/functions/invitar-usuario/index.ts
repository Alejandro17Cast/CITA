import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function responder(
  estado: number,
  contenido: Record<string, unknown>
): Response {
  return new Response(JSON.stringify(contenido), {
    status: estado,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    })
  }

  if (request.method !== 'POST') {
    return responder(405, {
      error: 'Método no permitido.',
    })
  }

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const redirectTo = Deno.env.get('CITA_INVITE_REDIRECT_URL')

    if (!url || !anonKey || !serviceKey || !redirectTo) {
      return responder(500, {
        error: 'Falta configurar el servicio de invitaciones.',
      })
    }

    const authorization = request.headers.get('Authorization')
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]

    if (!token) {
      return responder(401, {
        error: 'Necesitás iniciar sesión.',
      })
    }

    const cliente = createClient(url, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const {
      data: { user },
      error: authError,
    } = await cliente.auth.getUser(token)

    if (authError || !user) {
      return responder(401, {
        error: 'Tu sesión no es válida. Iniciá sesión nuevamente.',
      })
    }

    const { data: perfil, error: perfilError } = await cliente
      .from('perfiles')
      .select('rol, activo')
      .eq('id', user.id)
      .single()

    if (
      perfilError ||
      !perfil?.activo ||
      perfil.rol !== 'administrador'
    ) {
      return responder(403, {
        error: 'Solo un administrador activo puede invitar usuarios.',
      })
    }

    let datos: unknown

    try {
      datos = await request.json()
    } catch {
      return responder(400, {
        error: 'La solicitud no es válida.',
      })
    }

    if (
      !datos ||
      typeof datos !== 'object' ||
      Array.isArray(datos)
    ) {
      return responder(400, {
        error: 'La solicitud no es válida.',
      })
    }

    const body = datos as Record<string, unknown>

    const nombre =
      typeof body.nombre === 'string'
        ? body.nombre.trim()
        : ''

    const correo =
      typeof body.correo === 'string'
        ? body.correo.trim().toLowerCase()
        : ''

    const rol = body.rol

    if (nombre.length < 2 || nombre.length > 150) {
      return responder(400, {
        error: 'El nombre debe tener entre 2 y 150 caracteres.',
      })
    }

    if (
      correo.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)
    ) {
      return responder(400, {
        error: 'Ingresá un correo electrónico válido.',
      })
    }

    if (rol !== 'administrador' && rol !== 'encargado') {
      return responder(400, {
        error: 'Seleccioná un rol válido.',
      })
    }

    const administrador = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const { data: invitacion, error: inviteError } =
      await administrador.auth.admin.inviteUserByEmail(correo, {
        redirectTo,
        data: {
          nombre,
        },
      })

    if (inviteError) {
      const cuentaExistente =
        inviteError.code === 'email_exists' ||
        inviteError.code === 'user_already_exists'

      return responder(400, {
        error: cuentaExistente
          ? 'Ya existe una cuenta con ese correo. Consultala en la lista de usuarios.'
          : 'No se pudo enviar la invitación. Verificá el correo y la configuración del servicio de correo.',
      })
    }

    if (!invitacion.user) {
      return responder(500, {
        error:
          'No se pudo confirmar el resultado. Actualizá la lista de usuarios antes de reintentar.',
      })
    }

    const { error: actualizarError } = await cliente.rpc(
      'actualizar_usuario',
      {
        p_usuario_id: invitacion.user.id,
        p_nombre: nombre,
        p_rol: rol,
        p_activo: true,
      }
    )

    if (actualizarError) {
      return responder(200, {
        ok: true,
        requiereRevision: true,
        message:
          'La invitación se envió, pero no se pudo actualizar el perfil. Buscá la cuenta en Usuarios y verificá su nombre y rol antes de continuar.',
      })
    }

    return responder(200, {
      ok: true,
      requiereRevision: false,
      message:
        'Invitación enviada. Revisá la bandeja de entrada del nuevo usuario.',
    })
  } catch {
    return responder(500, {
      error:
        'No se pudo confirmar el resultado. Actualizá la lista de usuarios antes de reintentar.',
    })
  }
})