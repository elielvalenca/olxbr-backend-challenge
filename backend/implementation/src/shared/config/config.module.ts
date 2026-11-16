import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './env.js';

/** Config compartilhada pela API e pelo worker. */
export const AppConfigModule = ConfigModule.forRoot({
  isGlobal: true,
  cache: true,
  validate: validateEnv,
});
