"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readStoredRole } from "@/app/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coffee, UtensilsCrossed } from "lucide-react";
import { useIsDirector } from "@/hooks/use-is-director";

export default function FnBPosPage() {
  const isDirector = useIsDirector();
  const router = useRouter();

  useEffect(() => {
    const role = readStoredRole();
    if (role === "kitchen") {
      router.replace("/dashboard/kitchen");
      return;
    }
    if (role === "barista") {
      router.replace("/dashboard/barista");
    }
  }, [router]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">F&amp;B POS</h1>
          <p className="text-muted-foreground text-sm uppercase font-bold tracking-wider">
            Unified access for kitchen and barista operations
          </p>
        </div>
        <Badge variant="outline" className="h-10 px-4 justify-center border-primary text-primary font-black uppercase text-[10px] tracking-widest">
          One Menu Tab
        </Badge>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-2">
              <UtensilsCrossed className="w-6 h-6" />
            </div>
            <CardTitle className="text-xl font-black uppercase tracking-tight">Kitchen POS</CardTitle>
            <CardDescription>Food order intake, queue, and settlement workflow</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="h-11 font-black uppercase text-[10px] tracking-widest">
              <Link href="/dashboard/kitchen">{isDirector ? "Open Kitchen Analytics" : "Open Kitchen POS"}</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-2">
              <Coffee className="w-6 h-6" />
            </div>
            <CardTitle className="text-xl font-black uppercase tracking-tight">Barista POS</CardTitle>
            <CardDescription>Beverage order intake, queue, and settlement workflow</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="h-11 font-black uppercase text-[10px] tracking-widest">
              <Link href="/dashboard/barista">{isDirector ? "Open Barista Analytics" : "Open Barista POS"}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
