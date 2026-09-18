import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the first version had seven pages; they are now one dashboard plus the traveller app
  async redirects() {
    return [
      { source: "/gap", destination: "/", permanent: false },
      { source: "/jomrasa", destination: "/", permanent: false },
      { source: "/state/:code", destination: "/", permanent: false },
      { source: "/planner", destination: "/trip", permanent: false },
    ];
  },
};

export default nextConfig;
