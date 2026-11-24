/** @type {import('next').NextConfig} */
// REL=1 builds with relative asset paths (for hosting under a sub-path)
export default { output: 'export', images: { unoptimized: true }, assetPrefix: process.env.REL ? '.' : undefined };
