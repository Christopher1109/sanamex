import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const users = [
      { username: 'admin', nombre: 'Administrador General', role: 'admin', password: 'Admin2024!' },
      { username: 'gerente01', nombre: 'Gerente Sucursal 1', role: 'gerente', password: 'Gerente2024!' },
      { username: 'cajero01', nombre: 'Cajero Sucursal 1', role: 'cajero', password: 'Cajero2024!' },
      { username: 'almacen01', nombre: 'Almacenista Sucursal 1', role: 'almacen', password: 'Almacen2024!' },
      { username: 'repartidor01', nombre: 'Repartidor 1', role: 'repartidor', password: 'Repartidor2024!' },
      { username: 'auditor01', nombre: 'Auditor General', role: 'auditor', password: 'Auditor2024!' },
    ]

    const results = []

    for (const u of users) {
      const email = `${u.username}@sistema.local`

      // Check if user exists
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
      const existing = existingUsers?.users?.find(usr => usr.email === email)

      let userId: string

      if (existing) {
        userId = existing.id
        results.push({ username: u.username, status: 'already_exists', id: userId })
      } else {
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: u.password,
          email_confirm: true,
          user_metadata: { username: u.username, nombre: u.nombre }
        })

        if (authError) {
          results.push({ username: u.username, status: 'error', error: authError.message })
          continue
        }
        userId = authData.user.id
        results.push({ username: u.username, status: 'created', id: userId })
      }

      // Upsert profile
      await supabaseAdmin.from('profiles').upsert({
        id: userId,
        nombre: u.nombre,
        username: u.username,
        email: email,
        activo: true,
      }, { onConflict: 'id' })

      // Upsert role
      const { data: existingRole } = await supabaseAdmin
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .eq('role', u.role)
        .maybeSingle()

      if (!existingRole) {
        await supabaseAdmin.from('user_roles').insert({
          user_id: userId,
          role: u.role,
        })
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
