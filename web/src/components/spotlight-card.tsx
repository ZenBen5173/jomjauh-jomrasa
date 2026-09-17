"use client";

/**
 * Spotlight Card from the component library (controls/spotlight-card), made a
 * wrapper: same cursor-tracked radial glow and hover border, arbitrary children.
 */
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function SpotlightCard({
  children,
  className,
  glow = "rgba(57,135,229,0.16)",
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: string;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);

  return (
    <div
      ref={ref}
      onClick={onClick}
      onMouseMove={(e) => {
        const rect = ref.current?.getBoundingClientRect();
        if (rect) setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card transition-colors duration-300 hover:border-foreground/20",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: visible ? 1 : 0,
          background: `radial-gradient(340px circle at ${pos.x}px ${pos.y}px, ${glow}, transparent 70%)`,
        }}
      />
      <div className="relative h-full">{children}</div>
    </div>
  );
}
