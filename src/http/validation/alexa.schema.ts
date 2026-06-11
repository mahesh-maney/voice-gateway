import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

const AlexaSlotSchema = z.object({
  name: z.string().optional(),
  value: z.string().optional(),
  confirmationStatus: z.string().optional(),
  resolutions: z.unknown().optional(),
});

const AlexaIntentSchema = z.object({
  name: z.string(),
  confirmationStatus: z.string().optional(),
  slots: z.record(z.string(), AlexaSlotSchema).optional(),
});

export const AlexaRequestSchema = z.object({
  version: z.string(),
  session: z.object({
    user: z.object({
      userId: z.string(),
      accessToken: z.string().optional(),
    }),
  }),
  request: z.object({
    type: z.string(),
    requestId: z.string(),
    timestamp: z.string(),
    locale: z.string().optional(),
    intent: AlexaIntentSchema.optional(),
  }),
  context: z.object({
    System: z.object({
      device: z
        .object({ deviceId: z.string().optional() })
        .optional(),
    }),
  }),
});

export type ValidAlexaRequest = z.infer<typeof AlexaRequestSchema>;

/** Express middleware — rejects requests that do not match the Alexa shape. */
export function validateAlexa(req: Request, res: Response, next: NextFunction): void {
  const result = AlexaRequestSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: 'Invalid Alexa request shape.',
      issues: result.error.flatten().fieldErrors,
    });
    return;
  }
  next();
}
