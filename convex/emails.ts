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

export const saveNotifyEmail = mutation({
    args: {
        email: v.string(),
    },
    handler: async (ctx, args) => {
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

export const deleteNotifyEmail = mutation({
    args: {
        email: v.string(),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query('notifyEmails')
            .withIndex('by_email', q => q.eq('email', args.email))
            .first()

        if (!existing) {
            return { deleted: false, email: null, error: "No email found in database matching arg" }
        }

        try {
            await ctx.db.delete(existing._id)
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            return { deleted: false, email: existing.email, error: message }
        }

        return { deleted: true, email: existing.email, error: null }
    },
})