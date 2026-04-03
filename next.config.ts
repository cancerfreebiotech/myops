import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version ?? '0.1.0',
    NEXT_PUBLIC_DEPLOY_TIME: new Date().toISOString().slice(0, 16).replace('T', ' '),
  },
}

export default withNextIntl(nextConfig)
