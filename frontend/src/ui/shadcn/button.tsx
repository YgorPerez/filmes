import { Button as ButtonPrimitive } from '@base-ui/react/button'
import type { VariantProps } from 'class-variance-authority'
import { buttonVariants } from '../kit/button-variants'

export function Button({
  className,
  variant,
  type = 'button',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      type={type}
      className={buttonVariants({
        variant,
        className: String(className ?? ''),
      })}
      {...props}
    />
  )
}
