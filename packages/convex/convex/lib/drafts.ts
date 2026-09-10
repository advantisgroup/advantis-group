import { v } from "convex/values";

export const draftSurface = v.union(
  v.literal("announcement"),
  v.literal("blogPost"),
  v.literal("wikiEntry"),
  v.literal("update"),
  v.literal("suggestion"),
  v.literal("itTicket"),
  v.literal("coachWiki"),
  v.literal("applicantContact"),
  v.literal("applicantEmail"),
  v.literal("applicantInterview"),
);
