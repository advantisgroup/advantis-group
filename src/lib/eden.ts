/* eslint-disable no-console */
import { treaty } from '@elysiajs/eden'

import type { App } from '../app/api/[[...slugs]]/route'

const dev = process.env.NODE_ENV !== 'production'
const domain = dev ? 'localhost:3000' : process.env.NEXT_PUBLIC_DOMAIN

console.debug(dev, domain, process.env.NODE_ENV)

// this require .api to enter /api prefix
export const api = treaty<App>(domain!).api
