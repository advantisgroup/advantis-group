import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

export const saveEmail = mutation({
    args: {
        messageId: v.optional(v.string()),
        firstName: v.string(),
        lastName: v.string(),
        email: v.string(),
        phone: v.optional(v.string()),
        subject: v.string(),
        message: v.string(),
        company: v.optional(v.string()),
        submissionType: v.union(v.literal("message"), v.literal("callback"), v.literal("other")),
        topic: v.optional(v.string()),
        desiredDateTime: v.optional(v.string()),
        notes: v.optional(v.string()),
        accountEmail: v.string(),
        accountName: v.string(),
        clerkUserId: v.string(),
        status: v.union(v.literal("sent"), v.literal("failed")),
        error: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("emails", {
            ...args,
            sentAt: Date.now(),
        })
    },
})

export const listEmailsByClerkUserId = query({
    args: {
        clerkUserId: v.string(),
    },
    handler: async (ctx, args) => {
        if (!args.clerkUserId) {
            console.error("No clerk user id provided")
            return []
        }
            const existing = await ctx.db.query("emails").withIndex("by_clerkUserId_sentAt", q => q.eq("clerkUserId", args.clerkUserId).gte("sentAt", 0)).order("desc").take(50)
            console.log(existing)
            if (!existing) {
                console.error("No submissions found for user", args.clerkUserId)
                return []
            }

            return existing
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
            return { deleted: false, email: null, error: 'No email found in database matching arg' }
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
