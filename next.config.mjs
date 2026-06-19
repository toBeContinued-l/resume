/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["amqplib", "mammoth", "mysql2", "pdfjs-dist"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({
        child_process: "commonjs child_process",
        crypto: "commonjs crypto",
        fs: "commonjs fs",
        "fs/promises": "commonjs fs/promises",
        os: "commonjs os",
        path: "commonjs path",
        stream: "commonjs stream",
        util: "commonjs util",
        zlib: "commonjs zlib",
      });
    }
    return config;
  }
};

export default nextConfig;
