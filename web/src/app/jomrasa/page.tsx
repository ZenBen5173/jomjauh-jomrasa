"use client";

import { Card } from "@/components/charts";
import { PageHeader } from "@/components/shell";

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="JomRasa" title="How travellers feel, state by state">
        This module reads public travel writing in Malay, English and Mandarin. Text collection and tagging are in progress.
      </PageHeader>
      <Card><p className="text-sm text-muted-foreground">Coming online once the text pipeline has run.</p></Card>
    </>
  );
}
