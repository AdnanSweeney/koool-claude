import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const RESEND_API_URL = "https://api.resend.com/emails/batch"

interface InviteRequest {
  emails: string[]
  poolId: string
  inviterName: string
  poolName: string
  inviteCode: string
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    })
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY")
  if (!resendApiKey) {
    return new Response(
      JSON.stringify({ error: "RESEND_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }

  const body: InviteRequest = await req.json()
  const { emails, inviterName, poolName, inviteCode } = body

  if (!emails || emails.length === 0) {
    return new Response(
      JSON.stringify({ error: "No emails provided" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }

  const joinLink = `${req.headers.get("origin") ?? "http://localhost:5173"}/join/${inviteCode}`

  const sent: string[] = []
  const errors: string[] = []

  // Send emails in batch via Resend
  const batchPayload = emails.map((email) => ({
    from: "Koool <noreply@koool.app>",
    to: [email],
    subject: `${inviterName} invited you to join "${poolName}" on Koool`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>You're invited!</h2>
        <p><strong>${inviterName}</strong> wants you to join their knockout pool <strong>"${poolName}"</strong> on Koool.</p>
        <p><a href="${joinLink}" style="display: inline-block; padding: 12px 24px; background: #000; color: #fff; text-decoration: none; border-radius: 6px;">Join Pool</a></p>
        <p style="color: #666; font-size: 14px;">Or copy this link: ${joinLink}</p>
      </div>
    `,
  }))

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(batchPayload),
    })

    if (response.ok) {
      sent.push(...emails)
    } else {
      const errBody = await response.text()
      errors.push(`Resend API error: ${errBody}`)
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Unknown error sending emails")
  }

  return new Response(
    JSON.stringify({ sent: sent.length, errors }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )
})
