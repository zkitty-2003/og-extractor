import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export const formatInt = (n: number | string) => {
    const num = typeof n === 'string' ? parseFloat(n) : n;
    if (isNaN(num)) return "0";
    return Math.round(num).toLocaleString('en-US', { maximumFractionDigits: 0 });
};

export const formatMs = (n: number) => `${formatInt(n)} ms`;

export const formatPct = (n: number) => `${formatInt(n)}%`;

