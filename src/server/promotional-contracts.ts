import { z } from "zod";

export const contentStateEnum = z.enum(["draft", "scheduled", "published", "archived"]);

export const merchandiseItemSchema = z.object({
  id: z.string().uuid().optional(),
  edition_id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name is required").max(160, "Name must be under 160 characters"),
  description: z.string().trim().min(1, "Description is required").max(2000, "Description must be under 2000 characters"),
  image_url: z.string().trim().url("Valid image URL is required").regex(/^https?:\/\//, "Image URL must use http or https"),
  image_alt: z.string().trim().min(1, "Image description is required").max(300, "Image description must be under 300 characters"),
  sizes: z.array(z.string().trim()).default([]),
  availability_note: z.string().trim().min(1, "Availability guidance is required").max(500, "Availability note must be under 500 characters"),
  collection_note: z.string().trim().min(1, "Collection instruction is required").max(1000, "Collection note must be under 1000 characters"),
  contact_note: z.string().trim().min(1, "Contact detail is required").max(500, "Contact note must be under 500 characters"),
  state: contentStateEnum.default("draft"),
  publish_at: z.string().datetime({ offset: true }).nullable().optional(),
});

export type MerchandiseItemInput = z.infer<typeof merchandiseItemSchema>;

export const sponsorItemSchema = z.object({
  id: z.string().uuid().optional(),
  edition_id: z.string().uuid().optional(),
  event_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1, "Partner name is required").max(160, "Name must be under 160 characters"),
  tier: z.string().trim().min(1, "Sponsor tier is required").max(80, "Tier must be under 80 characters"),
  logo_url: z.string().trim().url("Valid logo URL is required").regex(/^https?:\/\//, "Logo URL must use http or https"),
  logo_alt: z.string().trim().min(1, "Logo description is required").max(300, "Logo description must be under 300 characters"),
  description: z.string().trim().max(1000, "Description must be under 1000 characters").nullable().optional(),
  website_url: z.string().trim().url("Website URL must be valid").nullable().optional().or(z.literal("")),
  sort_order: z.coerce.number().int().default(0),
  state: contentStateEnum.default("draft"),
  publish_at: z.string().datetime({ offset: true }).nullable().optional(),
});

export type SponsorItemInput = z.infer<typeof sponsorItemSchema>;

