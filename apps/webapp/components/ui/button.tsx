import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:border-annex-purple focus-visible:shadow-[0_0_0_1px_rgba(177,37,255,0.3)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-annex-dark-purple border border-annex-light-purple text-annex-light-purple hover:opacity-70",
        destructive:
          "bg-annex-dark-red border border-annex-light-red text-annex-light-red hover:opacity-70",
        outline:
          "border border-annex-border-light/30 bg-transparent text-annex-white hover:opacity-70",
        secondary:
          "bg-annex-background-light border border-annex-border-light/40 text-annex-white hover:opacity-70",
        ghost:
          "bg-transparent text-annex-white hover:bg-white/10",
        link: "text-annex-light-purple underline-offset-4 hover:underline",
        auth: "border border-annex-border-light/30 bg-transparent text-annex-white hover:bg-annex-background-light transition-colors",
        active:
          "bg-annex-dark-green border border-annex-light-green text-annex-light-green hover:opacity-70",
        processing:
          "bg-annex-dark-yellow border border-annex-light-yellow text-annex-light-yellow hover:opacity-70",
        inactive:
          "bg-annex-dark-red border border-annex-light-red text-annex-light-red hover:opacity-70",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
