import { cn } from "@/lib/utils";

export function Form({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn("space-y-4", className)} {...props} />;
}

export function FormItem({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn("space-y-1", className)} {...props} />;
}

export function FormLabel({
    className,
    ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
    return (
        <label
            className={cn("text-xs font-medium text-muted-foreground", className)}
            {...props}
        />
    );
}

export function FormControl({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn("", className)} {...props} />;
}

export function FormMessage({
    className,
    ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
    return (
        <p className={cn("text-xs text-red-600", className)} {...props} />
    );
}
