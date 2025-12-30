import { v } from 'convex/values'
import { mutation } from './_generated/server'

export const saveEmail = mutation({
    args: {
        messageId: v.optional(v.string()),
        firstName: v.string(),
        lastName: v.string(),
        email: v.string(),
        phone: v.string(),
        subject: v.string(),
        message: v.string(),
        status: v.string(),
        error: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert('emails', {
            ...args,
            sentAt: Date.now(),
        })
    },
})
