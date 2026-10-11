import { z } from "zod";

import {
  DestinationTemplateEngine,
  TextOnlyDestinationTemplateSchema,
  type TemplateBindings,
} from "#destinations/template";

const EmailTemplateTextSchema = z.string().trim().min(1).max(4000);

// subjectTemplate and htmlTemplate are extra template slots next to `template`
// (the text body): the subject owns the whole header, the html body replaces the
// auto-generated <pre> block. `DestinationTemplateEngine.diagnoseConfig` only
// reads `config.template`, so these two fields are diagnosed here explicitly —
// without this superRefine an unknown variable would render away silently and
// the alert would still be delivered.
export const EmailConfigSchema = z
  .strictObject({
    endpointUrl: z.url(),
    to: z.array(z.email()).min(1),
    from: z.email(),
    replyTo: z.email().optional(),
    subjectPrefix: z.string().trim().optional(),
    subjectTemplate: EmailTemplateTextSchema.optional(),
    htmlTemplate: EmailTemplateTextSchema.optional(),
    headers: z.record(z.string(), z.string()).default({}),
    template: TextOnlyDestinationTemplateSchema.optional(),
  })
  .superRefine((config, context) => {
    const bindings: TemplateBindings = config.template?.bindings ?? {};

    for (const path of ["subjectTemplate", "htmlTemplate"] as const) {
      const template = config[path];

      if (!template) {
        continue;
      }

      for (const diagnostic of DestinationTemplateEngine.diagnoseTextTemplate(
        template,
        path,
        bindings,
      )) {
        if (diagnostic.severity !== "error") {
          continue;
        }

        context.addIssue({
          code: "custom",
          path: [path],
          message: diagnostic.message,
        });
      }
    }
  });

export type EmailConfig = z.infer<typeof EmailConfigSchema>;
