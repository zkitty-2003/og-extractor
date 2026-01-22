import * as React from "react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className = "", ...props }, ref) => {
        return (
            <input
                ref={ref}
                className={[
                    "flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm",
                    "placeholder:text-slate-400",
                    "focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    className,
                ].join(" ")}
                {...props}
            />
        );
    }
);

Input.displayName = "Input";
