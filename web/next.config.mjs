/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // wagmi's connectors barrel drags in the Coinbase/Base account connectors, which reference
    // @x402/* payment packages as optional peers. We only use the injected connector, so those
    // code paths are never executed — but webpack still tries to resolve them and fails the build.
    // Aliasing them to false makes the resolution a no-op.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@x402/core/client': false,
      '@x402/evm': false,
      '@x402/evm/exact/client': false,
      '@x402/evm/upto/client': false,
      '@x402/svm/exact/client': false,
    };
    // Long-standing WalletConnect/pino noise in the same dependency tree.
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
};

export default nextConfig;
