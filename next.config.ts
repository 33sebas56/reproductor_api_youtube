import type { NextConfig } from "next";


const nextConfig: NextConfig = {
  env: {
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
  },
};

export default nextConfig;

module.exports = {
  images: {
    domains: ['i.ytimg.com'],
  },
};

