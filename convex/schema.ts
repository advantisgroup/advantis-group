import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
    emails: defineTable({
        messageId: v.optional(v.string()),
        firstName: v.string(),
        lastName: v.string(),
        email: v.string(),
        phone: v.string(),
        subject: v.string(),
        message: v.string(),
        company: v.string(),
        submissionType: v.string(),
        topic: v.string(),
        desiredDateTime: v.string(),
        notes: v.string(),
        accountEmail: v.string(),
        accountName: v.string(),
        clerkUserId: v.string(),
        sentAt: v.number(),
        status: v.string(), // 'sent', 'failed'
        error: v.optional(v.string()),
    }).index('by_clerkUserId_sentAt', ['clerkUserId', 'sentAt']),
    notifyEmails: defineTable({
        email: v.string(),
        createdAt: v.number(),
    }).index('by_email', ['email']),
})
