"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  label?: string;
}

export function LoadingSpinner({ className, size = "md", label }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12",
  };

  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)}>
      <div className="relative">
        {/* Outer Glow */}
        <div className={cn(
          "absolute inset-0 rounded-full bg-blue-500/10 blur-xl animate-pulse",
          sizeClasses[size]
        )} />
        
        {/* Spinner Icon */}
        <Loader2 className={cn(
          "animate-spin text-blue-600 relative z-10",
          sizeClasses[size]
        )} />
      </div>
      
      {label && (
        <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] animate-pulse">
          {label}
        </p>
      )}
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="fixed inset-0 bg-white/80 backdrop-blur-md z-[999] flex items-center justify-center">
       <LoadingSpinner size="lg" label="Processing Terminal Data" />
    </div>
  );
}
