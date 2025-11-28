import { NextResponse } from 'next/server'

import { ratelimit } from '@/lib/rate-limit'
import { FormDataSchema } from '@/lib/schema'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
    const ip = req.headers.get('x-forwarded-for') ?? '127.0.0.1'
    const { success: rateLimitSuccess } = await ratelimit.limit(ip)

    if (!rateLimitSuccess) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const supabase = createServerClient()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data = await req.json()

    const result = FormDataSchema.safeParse(data)

    if (!result.success) {
        return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }

    const { error } = await supabase.from('contact_data').insert(result.data)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
}
