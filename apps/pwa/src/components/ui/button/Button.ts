import type { HTMLAttributes } from 'vue'
import { computed, defineComponent, h } from 'vue'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 min-h-12 px-5',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        brand: 'bg-brand text-brand-foreground hover:bg-brand/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-input bg-card hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        ghost: 'hover:bg-muted',
      },
      size: {
        default: 'h-12 px-5',
        sm: 'h-10 rounded-md px-3 text-sm',
        lg: 'h-14 rounded-xl px-6 text-lg',
        icon: 'h-12 w-12',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type ButtonVariants = VariantProps<typeof buttonVariants>

export const Button = defineComponent({
  name: 'UiButton',
  props: {
    variant: {
      type: String as () => NonNullable<ButtonVariants['variant']>,
      default: 'default',
    },
    size: {
      type: String as () => NonNullable<ButtonVariants['size']>,
      default: 'default',
    },
    class: {
      type: String as () => HTMLAttributes['class'],
      default: undefined,
    },
    type: {
      type: String as () => 'button' | 'submit' | 'reset',
      default: 'button',
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  setup(props, { slots, attrs }) {
    const classes = computed(() =>
      cn(buttonVariants({ variant: props.variant, size: props.size }), props.class),
    )

    return () =>
      h(
        'button',
        {
          ...attrs,
          type: props.type,
          disabled: props.disabled,
          class: classes.value,
        },
        slots.default?.(),
      )
  },
})
