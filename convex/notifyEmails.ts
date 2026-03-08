import { v } from 'convex/values'
import { mutation } from './_generated/server'

export const saveNotifyEmail = mutation({
    args: {
        email: v.string(),
    },
    handler: async (ctx, args) => {
        // Deduplicate: skip if this email was already registered
        const existing = await ctx.db
            .query('notifyEmails')
            .withIndex('by_email', q => q.eq('email', args.email))
            .first()

        if (existing) {
            return { duplicate: true }
        }

        await ctx.db.insert('notifyEmails', {
            email: args.email,
            createdAt: Date.now(),
        })

        return { duplicate: false }
    },
})
