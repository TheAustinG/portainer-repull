import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  imports: false,
  manifest: {
    name: 'Repull for Portainer',
    description: 'Lists your Portainer stacks and redeploys one with a fresh image pull.',
    permissions: ['storage', 'notifications'],
    optional_host_permissions: ['*://*/*'],
    browser_specific_settings: {
      gecko: {
        id: 'portainer-repull@agardner.dev',
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['none'] },
      },
    },
  },
});
