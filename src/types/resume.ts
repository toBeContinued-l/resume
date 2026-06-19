import { z } from "zod";

export const richTextSchema = z.object({
  format: z.literal("html"),
  html: z.string(),
  plainText: z.string()
});

export type RichText = z.infer<typeof richTextSchema>;

const linkSchema = z.object({
  label: z.string().min(1),
  url: z.string().url()
});

const baseSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  visible: z.boolean()
});

export const profileSectionSchema = baseSectionSchema.extend({
  type: z.literal("profile"),
  data: z.object({
    name: z.string().optional(),
    headline: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    links: z.array(linkSchema).optional(),
    avatarAssetId: z.string().optional(),
    summary: richTextSchema.optional()
  })
});

const datedDescriptionItemSchema = z.object({
  id: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  description: richTextSchema.optional()
});

export const educationSectionSchema = baseSectionSchema.extend({
  type: z.literal("education"),
  items: z.array(
    datedDescriptionItemSchema.extend({
      school: z.string().optional(),
      degree: z.string().optional(),
      major: z.string().optional()
    })
  )
});

export const workExperienceSectionSchema = baseSectionSchema.extend({
  type: z.literal("work_experience"),
  items: z.array(
    datedDescriptionItemSchema.extend({
      company: z.string().optional(),
      role: z.string().optional()
    })
  )
});

export const projectSectionSchema = baseSectionSchema.extend({
  type: z.literal("project"),
  items: z.array(
    datedDescriptionItemSchema.extend({
      name: z.string().optional(),
      role: z.string().optional(),
      links: z.array(linkSchema).optional()
    })
  )
});

export const skillSectionSchema = baseSectionSchema.extend({
  type: z.literal("skill"),
  groups: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().optional(),
      skills: z.array(z.string().min(1))
    })
  )
});

const issuedItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  issuer: z.string().optional(),
  issuedAt: z.string().optional(),
  description: richTextSchema.optional()
});

export const certificateSectionSchema = baseSectionSchema.extend({
  type: z.literal("certificate"),
  items: z.array(issuedItemSchema)
});

export const honorSectionSchema = baseSectionSchema.extend({
  type: z.literal("honor"),
  items: z.array(issuedItemSchema)
});

export const customSectionSchema = baseSectionSchema.extend({
  type: z.literal("custom"),
  content: richTextSchema
});

export const resumeSectionSchema = z.discriminatedUnion("type", [
  profileSectionSchema,
  educationSectionSchema,
  workExperienceSectionSchema,
  projectSectionSchema,
  skillSectionSchema,
  certificateSectionSchema,
  honorSectionSchema,
  customSectionSchema
]);

export type ResumeSection = z.infer<typeof resumeSectionSchema>;

export const resumeAssetSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("image"),
  mimeType: z.string().min(1),
  dataRef: z.string().min(1),
  alt: z.string().optional()
});

export type ResumeAsset = z.infer<typeof resumeAssetSchema>;

export const confirmationItemSchema = z.object({
  id: z.string().min(1),
  fieldPath: z.string().min(1),
  message: z.string().min(1),
  status: z.enum(["pending", "confirmed", "edited", "dismissed"])
});

export type ConfirmationItem = z.infer<typeof confirmationItemSchema>;

const baseResumeContentSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().min(1),
  sections: z.array(resumeSectionSchema),
  moduleOrder: z.array(z.string().min(1)),
  assets: z.array(resumeAssetSchema),
  confirmationItems: z.array(confirmationItemSchema)
});

export const resumeContentSchema = baseResumeContentSchema.superRefine(
  (content, ctx) => {
    const sectionIds = new Set(content.sections.map((section) => section.id));
    const orderedIds = new Set(content.moduleOrder);

    if (sectionIds.size !== content.sections.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sections"],
        message: "Section ids must be unique"
      });
    }

    for (const sectionId of content.moduleOrder) {
      if (!sectionIds.has(sectionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["moduleOrder"],
          message: `moduleOrder references unknown section ${sectionId}`
        });
      }
    }

    for (const sectionId of sectionIds) {
      if (!orderedIds.has(sectionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["moduleOrder"],
          message: `moduleOrder is missing section ${sectionId}`
        });
      }
    }

    for (const section of content.sections) {
      if (section.type === "profile" && section.data.avatarAssetId) {
        const hasAsset = content.assets.some(
          (asset) => asset.id === section.data.avatarAssetId
        );
        if (!hasAsset) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["sections", section.id, "data", "avatarAssetId"],
            message: "avatarAssetId must reference an existing asset"
          });
        }
      }
    }
  }
);

export type ResumeContent = z.infer<typeof resumeContentSchema>;

export const resumeLayoutSchema = z
  .object({
    schemaVersion: z.literal(1),
    template: z.literal("default"),
    theme: z.object({
      fontFamily: z.enum(["system", "serif"]),
      accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      density: z.enum(["compact", "comfortable"])
    }),
    sectionLayout: z.array(
      z.object({
        sectionId: z.string().min(1),
        variant: z.enum(["standard", "timeline", "tag_group", "rich_text"])
      })
    )
  })
  .superRefine((layout, ctx) => {
    const sectionIds = new Set<string>();
    for (const item of layout.sectionLayout) {
      if (sectionIds.has(item.sectionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sectionLayout"],
          message: `Duplicate layout entry for section ${item.sectionId}`
        });
      }
      sectionIds.add(item.sectionId);
    }
  });

export type ResumeLayout = z.infer<typeof resumeLayoutSchema>;

export const validateResumeContentAndLayout = (
  content: ResumeContent,
  layout: ResumeLayout
) => {
  const contentResult = resumeContentSchema.safeParse(content);
  if (!contentResult.success) {
    return contentResult;
  }

  const layoutResult = resumeLayoutSchema.safeParse(layout);
  if (!layoutResult.success) {
    return layoutResult;
  }

  const sectionIds = new Set(content.sections.map((section) => section.id));
  for (const item of layout.sectionLayout) {
    if (!sectionIds.has(item.sectionId)) {
      return {
        success: false as const,
        error: new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            path: ["sectionLayout"],
            message: `sectionLayout references unknown section ${item.sectionId}`
          }
        ])
      };
    }
  }

  return { success: true as const, data: { content, layout } };
};
