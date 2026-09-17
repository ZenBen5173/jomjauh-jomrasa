"use client";

import { MotionConfig } from "motion/react";
import { Shell } from "@/components/shell";
import { StoreProvider } from "@/lib/store";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <StoreProvider>
        <Shell>{children}</Shell>
      </StoreProvider>
    </MotionConfig>
  );
}
