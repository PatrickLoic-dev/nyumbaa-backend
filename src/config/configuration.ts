import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('api/v1'),
  DATABASE_URL: Joi.string().required(),
  DIRECT_URL: Joi.string().required(),
  SUPABASE_URL: Joi.string().uri().required(),
  SUPABASE_ANON_KEY: Joi.string().required(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),
  RESEND_API_KEY: Joi.string().required(),
  RESEND_FROM_EMAIL: Joi.string().email().default('noreply@nyumbaa.app'),
  DEEPL_API_KEY: Joi.string().required(),
  REDIS_URL: Joi.string().default('redis://localhost:6379'),
  PERSPECTIVE_API_KEY: Joi.string().optional(),
  SUPABASE_STORAGE_BUCKET: Joi.string().default('post-images'),
  AWS_REGION: Joi.string().default('eu-west-1'),
  AWS_ACCESS_KEY_ID: Joi.string().optional(),
  AWS_SECRET_ACCESS_KEY: Joi.string().optional(),
  CORS_ORIGIN: Joi.string().default('*'),
  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(100),
});

export const configuration = () => ({
  nodeEnv: process.env.NODE_ENV,
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.RESEND_FROM_EMAIL,
  },
  deepl: {
    apiKey: process.env.DEEPL_API_KEY,
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  perspective: {
    apiKey: process.env.PERSPECTIVE_API_KEY,
  },
  storage: {
    bucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'post-images',
  },
  aws: {
    region: process.env.AWS_REGION ?? 'eu-west-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  cors: {
    origin: process.env.CORS_ORIGIN,
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
  },
});
