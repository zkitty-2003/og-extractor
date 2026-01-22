import * as React from "react"
import { cn } from "@/lib/utils"

const AvatarContext = React.createContext<{
    sourceLoaded: boolean;
    setSourceLoaded: (loaded: boolean) => void;
}>({
    sourceLoaded: false,
    setSourceLoaded: () => { },
});

const Avatar = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
    const [sourceLoaded, setSourceLoaded] = React.useState(false);

    return (
        <AvatarContext.Provider value={{ sourceLoaded, setSourceLoaded }}>
            <div
                ref={ref}
                className={cn(
                    "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
                    className
                )}
                {...props}
            >
                {children}
            </div>
        </AvatarContext.Provider>
    )
})
Avatar.displayName = "Avatar"

const AvatarImage = React.forwardRef<
    HTMLImageElement,
    React.ImgHTMLAttributes<HTMLImageElement>
>(({ className, src, ...props }, ref) => {
    const { setSourceLoaded } = React.useContext(AvatarContext);
    const [hasError, setHasError] = React.useState(false);

    React.useLayoutEffect(() => {
        if (!src) {
            setHasError(true);
            setSourceLoaded(false);
            return;
        }

        const img = new Image();
        img.src = src;
        img.onload = () => {
            setHasError(false);
            setSourceLoaded(true);
        };
        img.onerror = () => {
            setHasError(true);
            setSourceLoaded(false);
        };
    }, [src, setSourceLoaded]);

    if (hasError || !src) return null;

    return (
        <img
            ref={ref}
            src={src}
            className={cn("aspect-square h-full w-full object-cover", className)}
            onError={() => {
                setHasError(true);
                setSourceLoaded(false);
            }}
            {...props}
        />
    )
})
AvatarImage.displayName = "AvatarImage"

const AvatarFallback = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
    const { sourceLoaded } = React.useContext(AvatarContext);

    if (sourceLoaded) return null;

    return (
        <div
            ref={ref}
            className={cn(
                "flex h-full w-full items-center justify-center rounded-full bg-slate-100 text-slate-500",
                className
            )}
            {...props}
        />
    )
})
AvatarFallback.displayName = "AvatarFallback"

export { Avatar, AvatarImage, AvatarFallback }
