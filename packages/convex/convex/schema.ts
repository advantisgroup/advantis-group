import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
    emails: defineTable({
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
        sentAt: v.number(),
        status: v.union(v.literal("sent"), v.literal("failed")),
        error: v.optional(v.string()),
    }).index('by_clerkUserId_sentAt', ['clerkUserId', 'sentAt']),
    notifyEmails: defineTable({
        email: v.string(),
        createdAt: v.number(),
    }).index('by_email', ['email']),
})
