import { treaty } from '@elysiajs/eden'

import type { App } from '../app/api/[[...slugs]]/route'

// this require .api to enter /api prefix
export const api = treaty<App>('localhost:3000').api
